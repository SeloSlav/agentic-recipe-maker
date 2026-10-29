import { lazyOpenAI } from '../../lib/openai-client';
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { db } from "../../lib/backend/client";
import { collection, addDoc, serverTimestamp } from '../../lib/backend/database';

const openai = lazyOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to store user prompts in local backend
const storeUserPrompt = async (userId: string | undefined, message: string, conversationHistory: any[], recipeContext: string) => {
  try {
    await addDoc(collection(db, 'prompts'), {
      userId: userId || 'anonymous',
      message: message,
      conversationHistory: conversationHistory,
      recipeContext: recipeContext,
      type: 'recipe_chat',
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error storing user prompt:', error);
    // Don't throw error to prevent disrupting the main flow
  }
};

export async function POST(request: Request) {
    try {
        const { messages, recipeContent, userId } = await request.json();

        if (!recipeContent) {
            return NextResponse.json({
                assistantMessage: "I'm sorry dear, but I can't seem to find the recipe details. Please try refreshing the page."
            });
        }

        // Store the last user message if it exists
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.role === "user") {
                storeUserPrompt(userId, lastMessage.content, messages.slice(0, -1), recipeContent);
            }
        }

        // Create system message with recipe context
        const systemMessage = {
            role: "system",
            content: `You are Baba Selo, a wise and loving Croatian grandmother who is an expert cook.
            You are helping someone with this specific recipe. Here are the complete recipe details:

            ===== RECIPE DETAILS =====
${recipeContent}
            ========================

            IMPORTANT INSTRUCTIONS:
            1. ALWAYS reference specific ingredients and steps from the recipe above when giving advice.
            2. Use the exact ingredient names and quantities mentioned in the ingredients list.
            3. When discussing steps, refer to them by their numbers from the directions.
            4. Be warm and encouraging, using terms of endearment like "dear" or "darling".
            5. If asked about substitutions, look at the specific ingredients listed above.
            6. Consider the cuisine type, cooking time, and difficulty level when giving advice.
            7. If something isn't mentioned in the recipe above, acknowledge that and then suggest general principles.
            8. For ANY questions not related to this specific recipe, respond with:
               "Oh darling, let's stay focused on this recipe for now. If you want to chat about other things, click the profile icon in the top right, then 'Home' in the menu, and I'll meet you in the main living room. Now, what would you like to know about this dish?"

            Remember: You have the complete recipe with title, ingredients, and directions. Always use this information in your responses.
            For ANY off-topic questions, use the exact redirect message from instruction #8.`
        };

        // Add recipe context as the first assistant message
        const contextMessage = {
            role: "assistant",
            content: "Hello dear! I have the recipe details right in front of me. What would you like to know about making this dish?"
        };

        // Ensure we always have the recipe context in the conversation
        const apiMessages = [
            systemMessage,
            contextMessage,
            ...messages.slice(1) // Skip the first generic greeting message
        ];

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: apiMessages,
            temperature: 0.7,
            max_tokens: 500,
        });

        return NextResponse.json({
            assistantMessage: completion.choices[0].message.content
        });
    } catch (error) {
        console.error("Recipe chat error:", error);
        return NextResponse.json(
            { error: "Failed to process recipe chat" },
            { status: 500 }
        );
    }
}