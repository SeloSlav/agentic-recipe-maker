import { NextResponse } from "next/server";
import { callLLM } from "../../lib/callLLM";
import {
  checkEnrichmentCache,
  storeEnrichmentCache,
} from "../../lib/stores/enrichmentCache";
import { resolveRecipeLinks } from "../../lib/resolvePairingLinks";

const SYSTEM_PROMPT =
  "You are an expert sommelier and culinary pairing specialist. Given a recipe, suggest an ideal dish pairing (e.g., wine, side dish, or dessert) that complements it. Respond concisely and elegantly. Do not use any markdown formatting or asterisks in your response.";

export async function POST(req: Request) {
  const { recipe } = await req.json();

  if (!recipe) {
    return NextResponse.json({ error: "No recipe provided" }, { status: 400 });
  }

  const recipeText =
    typeof recipe === "string" ? recipe : JSON.stringify(recipe);
  const cacheKey = recipeText.slice(0, 2000);

  try {
    const cached = await checkEnrichmentCache<{ suggestion: string }>(
      "pairing",
      cacheKey
    );
    if (cached?.suggestion) {
      const recipeLinks = await resolveRecipeLinks(cached.suggestion);
      return NextResponse.json({
        suggestion: cached.suggestion,
        ...(recipeLinks.length > 0 && { recipeLinks }),
      });
    }
  } catch (err) {
    console.error("Enrichment cache lookup failed:", err);
  }

  try {
    const suggestion = await callLLM(SYSTEM_PROMPT, recipeText, {
      temperature: 0.7,
    });

    storeEnrichmentCache("pairing", cacheKey, { suggestion }).catch((err) =>
      console.error("Failed to store pairing cache:", err)
    );

    let recipeLinks: { name: string; recipeId: string; url: string }[] = [];
    try {
      recipeLinks = await resolveRecipeLinks(suggestion);
    } catch {
      /* recipe link resolution is best-effort */
    }

    return NextResponse.json({
      suggestion: suggestion || "No pairing suggestion available.",
      ...(recipeLinks.length > 0 && { recipeLinks }),
    });
  } catch (error) {
    console.error("Error calling LLM for pairing:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
