import { lazyOpenAI } from '../../lib/openai-client';
import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = lazyOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { ingredients, directions, cuisineType, diet, recipeId } = await request.json();

    // Create a prompt that describes the recipe
    const prompt = `Generate a concise title for a recipe with the following details:

Cuisine Type: ${cuisineType}
Diet Type: ${diet.join(', ')}

Ingredients:
${ingredients.map((ingredient: string) => `- ${ingredient}`).join('\n')}

Directions:
${directions.map((direction: string, index: number) => `${index + 1}. ${direction}`).join('\n')}

IMPORTANT RULES:
1. Return ONLY the title, nothing else
2. DO NOT use quotation marks
3. DO NOT add descriptions after a colon (e.g., NO ": Fresh, Tangy, Gluten-Free!")
4. Keep it simple and descriptive of the main ingredients or cooking method
5. Maximum 4 words
6. NO articles (a, an, the)
7. NO punctuation except hyphens for compound words

Example good titles:
- Spicy Chicken Curry
- Mediterranean Lentil Soup
- Grilled Vegetable Pasta
- Croatian Beef Stew

Example bad titles:
- "Spicy Thai Basil Chicken: A Flavorful Delight!"
- The Ultimate Beef Stew
- Fresh and Tangy Greek Salad: Perfect for Summer
- A Delicious Mediterranean Dish`;

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a recipe title generator. Generate clear, concise titles that describe the main ingredients or cooking method. Never use quotation marks or additional descriptions. Keep titles under 4 words."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "gpt-3.5-turbo",
      temperature: 0.3,
      max_tokens: 60,
    });

    const title = completion.choices[0].message.content?.trim();

    return NextResponse.json({ title });
  } catch (error) {
    console.error('Error in generateTitle:', error);
    return NextResponse.json(
      { error: 'Failed to generate title' },
      { status: 500 }
    );
  }
}