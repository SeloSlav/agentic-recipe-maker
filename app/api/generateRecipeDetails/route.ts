import { NextResponse } from "next/server";
import { createRecipeGraph } from "../../lib/recipeGraph";

function getBaseUrl() {
  return `http://127.0.0.1:${process.env.PORT || 3001}`;
}

function round2(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeResult(result: Record<string, unknown> | null) {
  if (!result) return null;
  const macros = result.macroInfo as { total?: Record<string, unknown>; per_serving?: Record<string, unknown>; servings?: number } | undefined;
  return {
    ...result,
    recipeSummary: result.summary || "",
    macroInfo:
      macros?.total && macros?.per_serving
        ? {
            servings: macros.servings ?? 4,
            per_serving: {
              calories: round2(macros.per_serving?.calories),
              carbs: round2(macros.per_serving?.carbs),
              fats: round2(macros.per_serving?.fats),
              proteins: round2(macros.per_serving?.proteins),
            },
            total: {
              calories: round2(macros.total?.calories),
              carbs: round2(macros.total?.carbs),
              fats: round2(macros.total?.fats),
              proteins: round2(macros.total?.proteins),
            },
          }
        : null,
    dishPairings: result.dishPairings || "",
    cookingTime: result.cookingTime || "30 min",
    cuisineType: result.cuisineType || "General",
    cookingDifficulty: result.cookingDifficulty || "medium",
    diet: Array.isArray(result.diet) ? result.diet : result.diet || [],
  };
}

export async function POST(request: Request) {
  try {
    const { recipeTitle, recipeContent, generateAll = false, skipMacroAndPairing = false } = await request.json();
    const baseUrl = getBaseUrl();

    const queryText =
      recipeTitle +
      (recipeContent && typeof recipeContent === "string" && recipeContent.trim().length > 0
        ? `\n\n${recipeContent.trim().slice(0, 500)}`
        : "");

    const graph = createRecipeGraph();
    const finalState = await graph.invoke(
      {
        queryText,
        recipeTitle,
        recipeContent: recipeContent || "",
        generateAll,
        skipMacroAndPairing,
        baseUrl,
        result: null,
        fromCache: false,
      },
      { configurable: {} }
    );

    const result = finalState?.result;
    const fromCache = finalState?.fromCache ?? false;
    if (!result?.ingredients?.length || !result?.directions?.length) {
      return NextResponse.json(
        {
          error: "Failed to generate recipe details",
          message: "AI did not return valid ingredients or directions arrays",
        },
        { status: 500 }
      );
    }

    const normalized = normalizeResult(result as Record<string, unknown>);
    return NextResponse.json({ ...normalized, fromCache });
  } catch (error: unknown) {
    console.error("Error in recipe generation:", error);
    return NextResponse.json(
      {
        error: "Failed to generate recipe details",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
