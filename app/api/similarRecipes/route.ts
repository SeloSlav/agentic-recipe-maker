import { NextResponse } from "next/server";
import { serverDb, serverAuth } from "../../lib/backend/admin";
import {
  getSimilarRecipes,
  recipeToSearchText,
} from "../../lib/stores/similarRecipesStore";

/** GET /api/similarRecipes?recipeId=xxx - returns similar recipes from pgvector */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const recipeId = searchParams.get("recipeId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "6", 10), 12);

    if (!recipeId) {
      return NextResponse.json({ error: "recipeId required" }, { status: 400 });
    }

    const db = serverDb;
    const recipeDoc = await db.collection("recipes").doc(recipeId).get();
    if (!recipeDoc.exists) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const data = recipeDoc.data()!;
    const ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];
    const directions = Array.isArray(data.directions) ? data.directions : [];
    const searchText = recipeToSearchText({
      ingredients,
      directions,
      recipeSummary: data.recipeSummary,
    });

    if (!searchText.trim()) {
      return NextResponse.json({ similar: [] });
    }

    const similar = await getSimilarRecipes(recipeId, searchText, limit, {
      sourceTitle: data.recipeTitle,
      searchText,
    });

    // Fetch usernames for similar recipes
    const userIds = [...new Set(similar.map((r) => r.userId).filter(Boolean))].slice(0, 10);
    let userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const usersSnap = await db
        .collection("users")
        .where("__name__", "in", userIds)
        .get();
      usersSnap.docs.forEach((d) => userMap.set(d.id, d.data().username || "Anonymous Chef"));
    }

    const withUsernames = similar.map((r) => ({
      ...r,
      username: userMap.get(r.userId) || "Anonymous Chef",
    }));

    return NextResponse.json({ similar: withUsernames });
  } catch (err) {
    console.error("Similar recipes error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch similar recipes" },
      { status: 500 }
    );
  }
}
