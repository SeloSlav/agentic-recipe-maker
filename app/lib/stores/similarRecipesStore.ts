/**
 * Similar recipes via pgvector.
 * Recipes are synced from database; similarity search by embedding.
 */
import { Document } from "@langchain/core/documents";
import { Pool } from "pg";
import {
  getOrCreateStore,
  resolveVectorTableName,
  getSharedPool,
  getConnectionConfig,
} from "./vectorStoreFactory";

const TABLE_NAME = "recipe_index";
const DEFAULT_LIMIT = 6;

export interface IndexedRecipe {
  id: string;
  recipeTitle: string;
  userId: string;
  cuisineType?: string;
  cookingDifficulty?: string;
  cookingTime?: string;
  diet?: string[];
  directions?: string[];
  ingredients?: string[];
  imageURL?: string;
  recipeSummary?: string;
  username?: string;
  [key: string]: unknown;
}

export function recipeToEmbeddingText(recipe: {
  recipeTitle?: string;
  ingredients?: string[];
  directions?: string[];
  recipeSummary?: string;
}): string {
  const parts: string[] = [];
  if (recipe.recipeTitle) parts.push(recipe.recipeTitle);
  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length)
    parts.push("Ingredients: " + recipe.ingredients.join(", "));
  if (Array.isArray(recipe.directions) && recipe.directions.length)
    parts.push("Directions: " + recipe.directions.join(" "));
  if (recipe.recipeSummary) parts.push(recipe.recipeSummary);
  return parts.join("\n\n").slice(0, 8000);
}

/** Search-optimized text: ingredients + directions + summary only (no title). Use for similarity search to find recipes with overlapping ingredients/techniques rather than same-name variants. */
export function recipeToSearchText(recipe: {
  ingredients?: string[];
  directions?: string[];
  recipeSummary?: string;
}): string {
  const parts: string[] = [];
  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length)
    parts.push("Ingredients: " + recipe.ingredients.join(", "));
  if (Array.isArray(recipe.directions) && recipe.directions.length)
    parts.push("Directions: " + recipe.directions.join(" "));
  if (recipe.recipeSummary) parts.push(recipe.recipeSummary);
  return parts.join("\n\n").slice(0, 8000);
}

function isTitleDuplicate(sourceTitle: string, candidateTitle: string): boolean {
  const normalize = (t: string) =>
    t
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();
  return normalize(sourceTitle) === normalize(candidateTitle);
}

export async function indexRecipe(recipe: IndexedRecipe): Promise<void> {
  const store = await getOrCreateStore(TABLE_NAME);
  if (!store) return;

  const text = recipeToEmbeddingText(recipe);
  if (!text.trim()) return;

  try {
    await store.addDocuments([
      new Document({
        pageContent: text,
        metadata: { recipeId: recipe.id, recipe },
      }),
    ]);
  } catch (err) {
    console.error("Failed to index recipe:", err);
  }
}

export async function indexRecipes(
  recipes: IndexedRecipe[],
  clearFirst = false
): Promise<void> {
  const config = getConnectionConfig();
  if (!config) throw new Error("Configure PostgreSQL before syncing recipes.");
  const store = await getOrCreateStore(TABLE_NAME);
  if (!store) throw new Error("Cannot initialize recipe embeddings. Check the embedding provider and PostgreSQL.");

  if (clearFirst) {
    const pool = new Pool(config);
    try {
      await pool.query(`TRUNCATE TABLE ${resolveVectorTableName(TABLE_NAME)}`);
    } catch {
      // Table might not exist yet
    } finally {
      await pool.end();
    }
  }

  // Compute embedding text once per recipe (not twice via filter + map)
  const docs = recipes
    .map((r) => ({ text: recipeToEmbeddingText(r), recipe: r }))
    .filter(({ text }) => text.trim().length > 0)
    .map(
      ({ text, recipe }) =>
        new Document({
          pageContent: text,
          metadata: { recipeId: recipe.id, recipe },
        })
    );

  if (docs.length === 0) return;

  try {
    await store.addDocuments(docs);
  } catch (err) {
    console.error("Failed to index recipes:", err);
    throw err;
  }
}

async function getStoredEmbedding(
  recipeId: string
): Promise<number[] | null> {
  const pool = getSharedPool();
  if (!pool) return null;

  try {
    const res = await pool.query(
      `SELECT embedding FROM ${resolveVectorTableName(TABLE_NAME)} WHERE metadata->>'recipeId' = $1 LIMIT 1`,
      [recipeId]
    );
    const row = res.rows[0];
    if (!row?.embedding) return null;

    const vec = row.embedding;
    if (Array.isArray(vec)) return vec;
    if (typeof vec === "string") {
      try {
        return JSON.parse(vec) as number[];
      } catch {
        return null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface SimilarRecipesTiming {
  getStoredEmbeddingMs?: number;
  similaritySearchMs: number;
  usedStoredEmbedding: boolean;
}

export interface SimilarRecipesOptions {
  sourceTitle?: string;
  searchText?: string;
}

export async function getSimilarRecipes(
  recipeId: string,
  recipeText: string,
  limit = DEFAULT_LIMIT,
  options?: SimilarRecipesOptions
): Promise<IndexedRecipe[]> {
  const { results } = await getSimilarRecipesWithTiming(
    recipeId,
    recipeText,
    limit,
    options
  );
  return results;
}

export async function getSimilarRecipesWithTiming(
  recipeId: string,
  recipeText: string,
  limit = DEFAULT_LIMIT,
  options?: SimilarRecipesOptions
): Promise<{ results: IndexedRecipe[]; timing: SimilarRecipesTiming }> {
  const store = await getOrCreateStore(TABLE_NAME);
  const timing: SimilarRecipesTiming = {
    similaritySearchMs: 0,
    usedStoredEmbedding: false,
  };

  if (!store) return { results: [], timing };

  const { sourceTitle, searchText } = options ?? {};
  const queryText = searchText?.trim() || recipeText;
  const fetchLimit = limit * 2;

  try {
    let t0 = Date.now();
    const storedVec = !searchText ? await getStoredEmbedding(recipeId) : null;
    timing.getStoredEmbeddingMs = Date.now() - t0;
    timing.usedStoredEmbedding = !!storedVec;

    t0 = Date.now();
    const rawResults = storedVec
      ? await store.similaritySearchVectorWithScore(storedVec, fetchLimit)
      : await store.similaritySearchWithScore(queryText, fetchLimit);
    timing.similaritySearchMs = Date.now() - t0;

    const seen = new Set<string>();
    const out: IndexedRecipe[] = [];

    for (const [doc] of rawResults) {
      const meta = doc.metadata as Record<string, unknown>;
      const recipe = meta?.recipe as IndexedRecipe | undefined;
      const rid = (meta?.recipeId ?? recipe?.id) as string | undefined;
      if (!rid || rid === recipeId || seen.has(rid)) continue;
      if (sourceTitle && recipe?.recipeTitle && isTitleDuplicate(sourceTitle, recipe.recipeTitle))
        continue;
      seen.add(rid);
      if (recipe) out.push(recipe);
      if (out.length >= limit) break;
    }

    return { results: out, timing };
  } catch (err) {
    console.error("Similar recipes search failed:", err);
    return { results: [], timing };
  }
}
