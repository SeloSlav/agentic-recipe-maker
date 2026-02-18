/**
 * Resolve dish names from pairing text to recipe links using RAG (recipe_index, optionally corpus).
 * Used by dishPairing API and chat route when pairing content is detected.
 */
import { getSimilarRecipes } from "./stores/similarRecipesStore";

/** Extract likely dish names from pairing text for recipe link resolution. */
export function extractDishNames(text: string): string[] {
  const names = new Set<string>();
  // Numbered list: "1. Mashed Potatoes: ..." or "2. Shopska Salata (A light...)"
  for (const m of text.matchAll(
    /^\d+[\.\)]\s*([A-Za-zÀ-ÿ\s\-']+?)(?=:|$|\n|\()/gm
  )) {
    const n = m[1].trim();
    if (n.length >= 2 && n.length <= 60) names.add(n);
  }
  // Bold text: "**Mashed Potatoes**"
  for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    const n = m[1].trim();
    if (n.length >= 2 && n.length <= 60) names.add(n);
  }
  return [...names];
}

async function findRecipeLink(
  dishName: string
): Promise<{ id: string; recipeTitle: string } | null> {
  const results = await getSimilarRecipes("pairing-link", dishName, 1, {
    searchText: dishName,
  });
  if (results.length === 0) return null;
  const top = results[0];
  const titleLower = (top.recipeTitle || "").toLowerCase();
  const searchLower = dishName.toLowerCase();
  if (
    titleLower.includes(searchLower) ||
    searchLower.includes(titleLower) ||
    titleLower.split(/\s+/).some((w) => searchLower.includes(w))
  ) {
    return { id: top.id, recipeTitle: top.recipeTitle };
  }
  return null;
}

export interface RecipeLink {
  name: string;
  recipeId: string;
  url: string;
}

/**
 * Resolve dish names in pairing text to recipe links.
 * Searches recipe_index (Firestore-synced recipes) via pgvector semantic search.
 */
export async function resolveRecipeLinks(
  suggestion: string
): Promise<RecipeLink[]> {
  const names = extractDishNames(suggestion);
  const links: RecipeLink[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    if (seen.has(name.toLowerCase())) continue;
    try {
      const match = await findRecipeLink(name);
      if (match && !seen.has(match.id)) {
        seen.add(name.toLowerCase());
        seen.add(match.id);
        links.push({
          name,
          recipeId: match.id,
          url: `/recipe/${match.id}`,
        });
      }
    } catch {
      /* ignore per-dish lookup errors */
    }
  }
  return links;
}
