import { NextResponse } from "next/server";
import { serverDb, serverAuth } from "../../../lib/backend/admin";
import { getAIConfig } from "../../../lib/ai-config";
import {
  indexRecipes,
  type IndexedRecipe,
} from "../../../lib/stores/similarRecipesStore";

/** Admin-only: sync database recipes to pgvector for similar-recipe search */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await serverAuth.verifyToken(idToken);
    const userId = decoded.uid;

    const adminDoc = await serverDb.collection("admins").doc(userId).get();
    if (!adminDoc.exists || adminDoc.data()?.active !== true) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const embeddingConfig = getAIConfig().embeddings;
    if (!embeddingConfig.configured) return NextResponse.json({ error: embeddingConfig.error }, { status: 503 });
    const db = serverDb;
    const snapshot = await db.collection("recipes").get();

    const recipes: IndexedRecipe[] = snapshot.docs
      .map((d) => {
        const data = d.data();
        const ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];
        const directions = Array.isArray(data.directions) ? data.directions : [];
        return {
          id: d.id,
          recipeTitle: data.recipeTitle || "Untitled",
          userId: data.userId || "",
          cuisineType: data.cuisineType || "Unknown",
          cookingDifficulty: data.cookingDifficulty || "Unknown",
          cookingTime: data.cookingTime || "Unknown",
          diet: data.diet || [],
          directions,
          ingredients,
          imageURL: data.imageURL || "",
          recipeSummary: data.recipeSummary || "",
          username: data.username || "Anonymous Chef",
        };
      })
      .filter((r) => {
        const text = [r.recipeTitle, r.ingredients?.join(" "), r.directions?.join(" "), r.recipeSummary].join(" ");
        return text.trim().length > 0;
      });

    const BATCH = 20;
    for (let i = 0; i < recipes.length; i += BATCH) {
      await indexRecipes(recipes.slice(i, i + BATCH), i === 0);
    }

    return NextResponse.json({ synced: recipes.length });
  } catch (err) {
    console.error("Sync recipes error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
