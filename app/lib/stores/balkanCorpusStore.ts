/**
 * Balkan recipe corpus vector store for RAG.
 * Pre-ingested authentic Balkan recipes; used for retrieval and direct return.
 */
import { Document } from "@langchain/core/documents";
import { getOrCreateStore, getSharedPool, resolveVectorTableName } from "./vectorStoreFactory";

const TABLE_NAME = "balkan_recipe_corpus";
const DEFAULT_LIMIT = 5;

export interface CorpusRecipe {
  title: string;
  ingredients: string[];
  directions: string[];
  cuisine?: string;
  region?: string;
}

export interface CorpusSearchResult {
  recipe: CorpusRecipe;
  score: number;
}

function recipeToPageContent(recipe: CorpusRecipe): string {
  const parts: string[] = [recipe.title];
  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
    parts.push("Ingredients:\n" + recipe.ingredients.join("\n"));
  }
  if (Array.isArray(recipe.directions) && recipe.directions.length) {
    parts.push("Directions:\n" + recipe.directions.join("\n"));
  }
  return parts.join("\n\n");
}

/**
 * Query the corpus for similar recipes. Returns results with cosine distance scores.
 */
export async function queryCorpus(
  text: string,
  limit = DEFAULT_LIMIT
): Promise<CorpusSearchResult[]> {
  const store = await getOrCreateStore(TABLE_NAME);
  if (!store) return [];

  try {
    const results = await store.similaritySearchWithScore(text, limit);
    return results.map(([doc, score]) => {
      const metadata = doc.metadata as Record<string, unknown>;
      return {
        recipe: {
          title: (metadata?.title as string) ?? "",
          ingredients: (metadata?.ingredients as string[]) ?? [],
          directions: (metadata?.directions as string[]) ?? [],
          cuisine: metadata?.cuisine as string | undefined,
          region: metadata?.region as string | undefined,
        },
        score,
      };
    });
  } catch (err) {
    console.error("Corpus query failed:", err);
    return [];
  }
}

/**
 * Ingest recipes into the corpus. Each recipe becomes one document.
 */
export async function ingestRecipes(recipes: CorpusRecipe[]): Promise<number> {
  const store = await getOrCreateStore(TABLE_NAME);
  if (!store) return 0;

  const docs = recipes.map(
    (recipe) =>
      new Document({
        pageContent: recipeToPageContent(recipe),
        metadata: {
          title: recipe.title,
          cuisine: recipe.cuisine,
          region: recipe.region,
          ingredients: recipe.ingredients,
          directions: recipe.directions,
        },
      })
  );

  try {
    await store.addDocuments(docs);
    return docs.length;
  } catch (err) {
    console.error("Corpus ingest failed:", err);
    throw err;
  }
}

/**
 * Get the count of recipes in the corpus.
 */
export async function getCorpusCount(): Promise<number> {
  const pool = getSharedPool();
  if (!pool) return 0;

  try {
    const res = await pool.query(`SELECT COUNT(*)::int FROM ${resolveVectorTableName(TABLE_NAME)}`);
    return res.rows[0]?.count ?? 0;
  } catch {
    return 0;
  }
}
