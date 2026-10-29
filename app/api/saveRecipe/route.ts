import { NextResponse } from 'next/server';
import { serverDb, serverAuth } from "../../lib/backend/admin";

const adminDb = serverDb;

export async function POST(req: Request) {
    let verifiedUserId: string;
    try {
        const authorization = req.headers.get('authorization');
        if (!authorization?.startsWith('Bearer ')) {
             return NextResponse.json({ error: "Unauthorized: Missing token" }, { status: 401 });
        }
        const idToken = authorization.split('Bearer ')[1];
        const decodedToken = await serverAuth.verifyToken(idToken);
        verifiedUserId = decodedToken.uid;
    } catch (error) {
        console.error("Auth Error in saveRecipe:", error);
        return NextResponse.json({ error: "Unauthorized: Invalid or expired token" }, { status: 401 });
    }

    const {
        recipeContent,
        cuisineType,
        cookingDifficulty,
        cookingTime,
        diet,
        docId
    } = await req.json();

    if (!recipeContent || !docId) {
        return NextResponse.json({ error: "Missing recipe content or document ID" }, { status: 400 });
    }

    try {
        const parseRecipe = (text: string) => {
            const raw = (text || "").trim();
            const lower = raw.toLowerCase();
            const ingPos = lower.indexOf("ingredients");
            const dirPos = lower.indexOf("directions");

            if (ingPos === -1 || dirPos === -1 || dirPos <= ingPos) {
                return { recipeTitle: raw.split("\n")[0]?.trim() || "Untitled Recipe", ingredients: [] as string[], directions: [] as string[] };
            }

            const ingredientsBlock = raw.slice(ingPos + 11, dirPos).trim();
            const directionsBlock = raw.slice(dirPos + 10).trim();

            const ingredients: string[] = [];
            for (const line of ingredientsBlock.split("\n")) {
                const parts = line.split(/(?=\s*[-•*]\s+)/);
                for (const p of parts) {
                    const cleaned = p.replace(/^[\s\-•*]+\s*/, "").trim();
                    if (cleaned && !cleaned.toLowerCase().startsWith("equipment") && cleaned.length > 2) {
                        ingredients.push(cleaned);
                    }
                }
            }

            const directions: string[] = [];
            for (const line of directionsBlock.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const cleaned = trimmed.replace(/^\d+[\.\)]\s*/, "").replace(/^[\-•*]\s*/, "").trim();
                if (cleaned && !cleaned.toLowerCase().startsWith("ah,") && !cleaned.toLowerCase().startsWith("na zdravlje")) {
                    directions.push(cleaned);
                }
            }

            const beforeIng = raw.slice(0, ingPos);
            const titleMatch = beforeIng.match(/([A-Za-z][^:\n]+(?:\([^)]+\))?)\s*Ingredients?/i)
                || beforeIng.match(/(?:^|[:.\n])\s*([^\n:]+?)\s*$/);
            let recipeTitle = (titleMatch ? titleMatch[1].trim() : beforeIng.split("\n").pop()?.trim() || raw.split("\n")[0]?.trim() || "Untitled Recipe");
            recipeTitle = recipeTitle.replace(/^Ah,?\s+[\w\s!.,]+:\s*/i, "").replace(/\s+Ingredients?\s*:?\s*$/i, "").trim();

            return { recipeTitle: recipeTitle || "Untitled Recipe", ingredients, directions };
        };

        const parsedRecipe = parseRecipe(recipeContent);

        const newRecipe = {
            ...parsedRecipe,
            userId: verifiedUserId,
            cuisineType,
            cookingDifficulty,
            cookingTime,
            diet,
            createdAt: serverDb.transforms.serverTimestamp()
        };

        console.log(`==> Attempting Admin SDK setDoc for docId: ${docId}`);
        console.log(`==> Authenticated User ID (verified): ${verifiedUserId}`);
        console.log(`==> Data being written (userId field): ${newRecipe.userId}`);

        const recipeDocRef = adminDb.collection("recipes").doc(docId);
        await recipeDocRef.set(newRecipe);

        try {
            const { indexRecipe } = await import("../../lib/stores/similarRecipesStore");
            await indexRecipe({
                id: docId,
                recipeTitle: newRecipe.recipeTitle,
                userId: verifiedUserId,
                cuisineType: newRecipe.cuisineType || "Unknown",
                cookingDifficulty: newRecipe.cookingDifficulty || "Unknown",
                cookingTime: newRecipe.cookingTime || "Unknown",
                diet: newRecipe.diet || [],
                ingredients: newRecipe.ingredients || [],
                directions: newRecipe.directions || [],
            });
        } catch (e) {
            console.error("Recipe index error (non-fatal):", e);
        }

        console.log(`==> Admin SDK setDoc successful for docId: ${docId}`);
        return NextResponse.json({ success: true, id: docId });

    } catch (error) {
        console.error("Error saving recipe using Admin SDK:", error);
        return NextResponse.json({ error: "Failed to save recipe (server error)" }, { status: 500 });
    }
}
