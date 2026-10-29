import { doc, getDoc } from "../../lib/backend/database";
import { db } from "../../lib/backend/client";

/**
 * Converts cooking time strings like "30 min", "1 hour", "1.5 hours" to ISO 8601 duration (e.g. PT30M, PT1H).
 */
function toISO8601Duration(timeStr: string): string | undefined {
  if (!timeStr || typeof timeStr !== "string") return undefined;
  const s = timeStr.trim().toLowerCase();
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*hours?/);
  const minMatch = s.match(/(\d+)\s*min(?:utes?)?/);
  if (hourMatch) {
    const h = Math.round(parseFloat(hourMatch[1]));
    return h > 0 ? `PT${h}H` : undefined;
  }
  if (minMatch) {
    const m = parseInt(minMatch[1], 10);
    return m > 0 ? `PT${m}M` : undefined;
  }
  return undefined;
}

interface RecipeSchemaProps {
  recipeId: string;
}

export async function RecipeSchema({ recipeId }: RecipeSchemaProps) {
  const recipeDoc = await getDoc(doc(db, "recipes", recipeId));
  const data = recipeDoc.exists() ? recipeDoc.data() : null;

  if (!data) return null;

  const name = data.recipeTitle || "Recipe";
  const image = data.imageURL || "https://www.babaselo.com/baba-removebg.png";
  const description = data.recipeSummary || `A delicious ${data.cuisineType || ""} recipe for ${name}`;
  const url = `https://www.babaselo.com/recipe/${recipeId}`;

  const ingredients: string[] = Array.isArray(data.ingredients)
    ? data.ingredients.filter((i): i is string => typeof i === "string")
    : [];

  const directions: string[] = Array.isArray(data.directions)
    ? data.directions.filter((d): d is string => typeof d === "string")
    : [];

  const recipeInstructions = directions.map((text) => ({
    "@type": "HowToStep",
    text,
  }));

  const cookTime = toISO8601Duration(data.cookingTime || "");

  const servings = data.macroInfo?.servings;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    description,
    image,
    url,
    recipeIngredient: ingredients,
    recipeInstructions:
      recipeInstructions.length > 0 ? recipeInstructions : undefined,
    ...(cookTime && { cookTime }),
    ...(servings && { recipeYield: `${servings} servings` }),
    ...(data.cuisineType && { recipeCuisine: data.cuisineType }),
    ...(Array.isArray(data.diet)
      ? (() => {
          const dietMap: Record<string, string> = {
            Vegetarian: "https://schema.org/VegetarianDiet",
            Vegan: "https://schema.org/VeganDiet",
            "Gluten-free": "https://schema.org/GlutenFreeDiet",
            "Dairy-free": "https://schema.org/DairyFreeDiet",
          };
          const suitableForDiet = data.diet
            .filter((d: string) => typeof d === "string" && dietMap[d])
            .map((d: string) => dietMap[d]);
          return suitableForDiet.length > 0 ? { suitableForDiet } : {};
        })()
      : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
