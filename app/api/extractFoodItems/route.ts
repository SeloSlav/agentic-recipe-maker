import { MODELS } from '../../lib/models';
import { lazyAIClient } from '../../lib/ai-client';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const ai = lazyAIClient();

export async function POST(request: Request) {
    try {
        const { text } = await request.json();

        const response = await ai.chat.completions.create({
            model: MODELS.enrichment,
            messages: [
                {
                    role: "system",
                    content: `You are a recipe identifier that extracts complete, prepared dishes from text. Your task is to identify dishes that someone would want a recipe for.

STRICT RULES FOR WHAT TO INCLUDE:
1. Complete dishes with multiple ingredients and preparation steps
2. Full salads with specific ingredients (e.g., "Greek salad with tomatoes, cucumbers, and feta")
3. Complex sauces or dips when they're complete dishes (e.g., "yogurt garlic sauce", "tzatziki")
4. Side dishes that require preparation (e.g., "roasted garlic potatoes")

STRICT RULES FOR WHAT TO EXCLUDE:
1. NO single ingredients or simple components
2. NO beverages of any kind (including wines, cocktails, drinks)
3. NO generic descriptions without specifics
4. NO basic condiments or simple sauces
5. NO partial dish descriptions

EXAMPLES OF VALID EXTRACTIONS:
Input: "Serve with a Greek salad with tomatoes, cucumbers, red onion, and feta cheese"
Output: {"items": ["Greek salad"]}

Input: "Pair with red wine and homemade tzatziki sauce with fresh herbs"
Output: {"items": ["tzatziki sauce"]}

Input: "Complement with roasted garlic and herb potatoes and a glass of wine"
Output: {"items": ["roasted garlic and herb potatoes"]}

EXAMPLES OF INVALID EXTRACTIONS:
Input: "Drizzle with olive oil and serve with fresh herbs and garlic"
Output: {"items": []}

Input: "Pair with Syrah/Shiraz and yogurt sauce"
Output: {"items": []}

When extracting dishes:
- Include the full name of the dish as described
- Capture complete preparations, not just ingredients
- Look for dishes that would need actual recipes
- Ensure the dish is specific enough to be made from a recipe

Return ONLY a JSON object with an "items" array containing the complete dishes found.`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        return NextResponse.json(JSON.parse(response.choices[0].message.content));
    } catch (error) {
        console.error('Error extracting food items:', error);
        return NextResponse.json({ error: 'Failed to extract food items' }, { status: 500 });
    }
}