/**
 * LangGraph pipeline for recipe generation with semantic caching and RAG corpus.
 * Flow: check_cache → [hit] return | [miss] retrieve_corpus → [direct] return | [else] generate → enrich → store_cache → return
 */
import { StateGraph, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { MODELS } from "./models";
import {
  checkRecipeCache,
  storeRecipeCache,
  CachedRecipeData,
} from "./stores/recipeVectorStore";
import { checkEnrichmentCache } from "./stores/enrichmentCache";
import { queryCorpus } from "./stores/balkanCorpusStore";

const DIRECT_MATCH_THRESHOLD = 0.1;
const RAG_CONTEXT_THRESHOLD = 0.3;
const RAG_CONTEXT_TOP_K = 3;

const recipeModel = new ChatOpenAI({
  model: MODELS.recipeGeneration,
  temperature: 0.5,
});

const RecipeStateAnnotation = Annotation.Root({
  queryText: Annotation<string>,
  recipeTitle: Annotation<string>,
  recipeContent: Annotation<string>,
  generateAll: Annotation<boolean>,
  skipMacroAndPairing: Annotation<boolean>,
  baseUrl: Annotation<string>,
  result: Annotation<Partial<CachedRecipeData> | null>,
  fromCache: Annotation<boolean>,
  corpusContext: Annotation<string>,
});

type RecipeState = typeof RecipeStateAnnotation.State;

async function checkCacheNode(
  state: RecipeState
): Promise<Partial<RecipeState>> {
  const cached = await checkRecipeCache(state.queryText);
  if (cached) {
    return { result: cached, fromCache: true };
  }
  return { fromCache: false };
}

async function retrieveCorpusNode(
  state: RecipeState
): Promise<Partial<RecipeState>> {
  if (state.fromCache) return {};

  const queryText =
    `${state.recipeTitle}${state.recipeContent ? ` ${String(state.recipeContent).trim().slice(0, 300)}` : ""}`.trim();
  if (!queryText) return { corpusContext: "" };

  const results = await queryCorpus(queryText, RAG_CONTEXT_TOP_K);
  if (results.length === 0) return { corpusContext: "" };

  const [top] = results;

  if (top.score < DIRECT_MATCH_THRESHOLD) {
    const r = top.recipe;
    return {
      result: {
        ingredients: r.ingredients,
        directions: r.directions,
        cuisineType: r.cuisine,
      },
      fromCache: true,
      corpusContext: "",
    };
  }

  if (top.score < RAG_CONTEXT_THRESHOLD) {
    const contextRecipes = results
      .filter((x) => x.score < RAG_CONTEXT_THRESHOLD)
      .slice(0, RAG_CONTEXT_TOP_K)
      .map((x) => {
        const r = x.recipe;
        return `${r.title}\nIngredients: ${r.ingredients.join("; ")}\nDirections: ${r.directions.join(" ")}`;
      })
      .join("\n\n---\n\n");
    return { corpusContext: contextRecipes };
  }

  return { corpusContext: "" };
}

async function generateNode(
  state: RecipeState
): Promise<Partial<RecipeState>> {
  if (state.fromCache) return {};

  const corpusCtx = state.corpusContext ?? "";
  const ragBlock = corpusCtx
    ? `\n\nUse these authentic Balkan recipes as reference (adapt, don't copy verbatim):\n${corpusCtx}\n\n`
    : "";

  const jsonPrompt = `Generate a complete recipe with proper ingredients and directions. Return ONLY valid JSON.

Recipe: ${state.recipeTitle}${state.recipeContent ? `\n\nDescription/context: ${String(state.recipeContent).trim().slice(0, 500)}` : ""}${ragBlock}

Return this exact JSON structure (no other text):
{
  "ingredients": ["2 cups canned white beans, drained and rinsed", "3 stalks celery, thinly sliced"],
  "directions": ["In a large bowl, combine the white beans, celery, and onion.", "Pour the dressing over and toss."]
}

Rules:
- ingredients: array of strings, each with quantity (e.g. "2 cups rice", "1/2 tsp salt")
- directions: array of strings, each a complete step
- Minimum 5 ingredients, 4 directions`;

  const response = await recipeModel.invoke([
    {
      role: "system",
      content:
        "You are a professional chef. Return ONLY valid JSON with ingredients and directions arrays. Each ingredient must include quantity. Each direction must be a full step.",
    },
    { role: "user", content: jsonPrompt },
  ]);

  const text =
    typeof response.content === "string" ? response.content : "";
  let parsed: { ingredients?: string[]; directions?: string[] } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON response from AI");
  }

  const ingredients = Array.isArray(parsed.ingredients)
    ? parsed.ingredients.filter(
        (i): i is string => typeof i === "string" && i.trim().length > 0
      )
    : [];
  const directions = Array.isArray(parsed.directions)
    ? parsed.directions.filter(
        (d): d is string => typeof d === "string" && d.trim().length > 0
      )
    : [];

  if (!ingredients.length || !directions.length) {
    throw new Error(
      "AI did not return valid ingredients or directions arrays"
    );
  }

  return { result: { ingredients, directions } };
}

async function fetchWithCache<T>(
  type: "classify" | "summary" | "macro" | "pairing",
  cacheKey: string,
  baseUrl: string,
  endpoint: string,
  body: unknown
): Promise<T | null> {
  try {
    const cached = await checkEnrichmentCache<T>(type, cacheKey);
    if (cached) return cached;
  } catch {
    /* cache miss or unavailable — fall through to API */
  }

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function enrichNode(
  state: RecipeState
): Promise<Partial<RecipeState>> {
  if (state.fromCache || !state.generateAll || !state.result) return {};

  const { result, baseUrl, recipeTitle, skipMacroAndPairing } = state;
  const ingredients = result.ingredients ?? [];
  const directions = result.directions ?? [];

  try {
    const classifyInput = `${recipeTitle}\n${ingredients.join("\n")}\n${directions.join("\n")}`;

    // Classify (must happen first — summary depends on its output)
    const classifyData = await fetchWithCache<{
      cooking_time: string;
      cuisine: string;
      difficulty: string;
      diet: string[];
    }>("classify", classifyInput, baseUrl, "/api/classifyRecipe", {
      title: recipeTitle,
      ingredients: ingredients.join("\n"),
      directions: directions.join("\n"),
    });

    const timeMap: Record<string, string> = {
      "15 minutes": "15 min",
      "30 minutes": "30 min",
      "45 minutes": "45 min",
      "1 hour": "1 hour",
      "2 hours": "1.5 hours",
    };
    if (classifyData) {
      result.cookingTime =
        timeMap[classifyData.cooking_time] || classifyData.cooking_time;
      result.cuisineType = classifyData.cuisine;
      result.cookingDifficulty = classifyData.difficulty;
      result.diet = classifyData.diet;
    }

    // Summary (depends on classify output)
    const summaryInput = `${recipeTitle}\n${ingredients.join("\n")}\n${directions.join("\n")}\n${result.cuisineType}\n${result.cookingTime}\n${result.cookingDifficulty}`;
    const summaryData = await fetchWithCache<{ summary: string }>(
      "summary",
      summaryInput,
      baseUrl,
      "/api/generateSummary",
      {
        title: recipeTitle,
        ingredients,
        directions,
        cuisineType: result.cuisineType,
        diet: result.diet,
        cookingTime: result.cookingTime,
        cookingDifficulty: result.cookingDifficulty,
      }
    );
    if (summaryData) result.summary = summaryData.summary;

    // Macros and pairings are independent — run in parallel
    if (!skipMacroAndPairing) {
      const recipeForMacros = `${recipeTitle}\n\nIngredients:\n${ingredients.join("\n")}\n\nDirections:\n${directions.join("\n")}`;

      const [macroData, pairingData] = await Promise.all([
        fetchWithCache<{ macros?: unknown }>(
          "macro",
          recipeForMacros,
          baseUrl,
          "/api/macroInfo",
          { recipe: recipeForMacros }
        ),
        fetchWithCache<{ suggestion: string }>(
          "pairing",
          recipeForMacros,
          baseUrl,
          "/api/dishPairing",
          { recipe: recipeForMacros }
        ),
      ]);

      if (macroData) result.macroInfo = macroData.macros || macroData;
      if (pairingData) result.dishPairings = pairingData.suggestion;
    }
  } catch (err) {
    console.error("Enrich step error:", err);
  }

  return { result: { ...result } };
}

async function storeCacheNode(
  state: RecipeState
): Promise<Partial<RecipeState>> {
  if (state.fromCache || !state.result || !state.generateAll) return {};
  const data = state.result as CachedRecipeData;
  if (data.ingredients?.length && data.directions?.length) {
    await storeRecipeCache(state.queryText, data);
  }
  return {};
}

function routeAfterCache(
  state: RecipeState
): "retrieve_corpus" | "__end__" {
  return state.fromCache ? "__end__" : "retrieve_corpus";
}

function routeAfterRetrieve(state: RecipeState): "generate" | "__end__" {
  return state.fromCache ? "__end__" : "generate";
}

export function createRecipeGraph() {
  const workflow = new StateGraph(RecipeStateAnnotation)
    .addNode("check_cache", checkCacheNode)
    .addNode("retrieve_corpus", retrieveCorpusNode)
    .addNode("generate", generateNode)
    .addNode("enrich", enrichNode)
    .addNode("store_cache", storeCacheNode)
    .addEdge("__start__", "check_cache")
    .addConditionalEdges("check_cache", routeAfterCache, ["retrieve_corpus", "__end__"])
    .addConditionalEdges("retrieve_corpus", routeAfterRetrieve, ["generate", "__end__"])
    .addEdge("generate", "enrich")
    .addEdge("enrich", "store_cache")
    .addEdge("store_cache", "__end__");

  return workflow.compile();
}
