/**
 * LangChain StructuredTools for Baba Selo chat.
 * Wraps the existing chatTools handlers for use with LangGraph.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  handleSaveRecipe,
  handleGetSimilarRecipes,
  handleConvertServings,
  handleGetNutrition,
  handleIngredientSubstitution,
  handleSetTimer,
  handleTranslateRecipe,
  handleGenerateMealPlan,
  handleAddToMealPlan,
  handleSeasonalTips,
  handleFindByIngredients,
  handleUnitConversion,
} from "./chatTools";

export function createBabaChatTools(userId: string) {
  const uid = userId || "anonymous";

  return [
    tool(
      async ({ subject }) => {
        const { generateImageForChat } = await import("./generateImageForChat");
        const { imageUrl } = await generateImageForChat(
          `Photorealistic food photograph. ${subject}. Natural lighting, appetizing, professional food photography.`,
          uid
        );
        return JSON.stringify({ imageUrl, success: true });
      },
      {
        name: "generate_image",
        description:
          "Generate an image of a food, dish, or culinary item when the user asks for a picture, drawing, or image of something.",
        schema: z.object({
          subject: z.string().describe("The food, dish, or item to draw (e.g. 'kajmak on fresh bread', 'a plate of sarma'). Be descriptive."),
        }),
      }
    ),
    tool(
      async ({ recipeContent }) => {
        const baseUrl = `http://127.0.0.1:${process.env.PORT || 3001}`;
        let cls = null;
        try {
          const res = await fetch(`${baseUrl}/api/classifyRecipe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: recipeContent }),
          });
          const data = await res.json();
          cls = data.diet ? { diet: data.diet, cuisine: data.cuisine, cooking_time: data.cooking_time, difficulty: data.difficulty } : null;
        } catch {
          // ignore
        }
        const result = await handleSaveRecipe({ recipeContent, userId: uid, classification: cls });
        return JSON.stringify(result);
      },
      {
        name: "save_recipe",
        description: "Save a recipe to the user's collection when they say 'save this', 'add to my collection', 'keep this recipe', etc.",
        schema: z.object({
          recipeContent: z.string().describe("The full recipe text including title, ingredients, and directions."),
        }),
      }
    ),
    tool(
      async ({ recipeText }) => {
        const result = await handleGetSimilarRecipes({ recipeText, limit: 3 });
        return JSON.stringify(result);
      },
      {
        name: "get_similar_recipes",
        description: "Find recipes similar to a given one. Use when user asks 'what else is like this?', 'something similar to X'. Returns 3 results.",
        schema: z.object({
          recipeText: z.string().describe("The recipe text to find similar recipes for."),
        }),
      }
    ),
    tool(
      async ({ recipeContent, targetServings }) => {
        const result = await handleConvertServings({ recipeContent, targetServings });
        return JSON.stringify(result);
      },
      {
        name: "convert_servings",
        description: "Scale a recipe to a different number of servings. Use when user says 'make this for 6 people', 'double this', 'scale for 8'.",
        schema: z.object({
          recipeContent: z.string().describe("The full recipe text."),
          targetServings: z.number().describe("The desired number of servings."),
        }),
      }
    ),
    tool(
      async ({ recipeContent }) => {
        const result = await handleGetNutrition({ recipeContent });
        return JSON.stringify(result);
      },
      {
        name: "get_nutrition",
        description: "Get calorie and macro (protein, carbs, fat) info for a recipe. Use when user asks 'how many calories?', 'nutrition info'.",
        schema: z.object({
          recipeContent: z.string().describe("The full recipe text."),
        }),
      }
    ),
    tool(
      async ({ ingredient }) => {
        const result = await handleIngredientSubstitution({ ingredient });
        return JSON.stringify(result);
      },
      {
        name: "ingredient_substitution",
        description: "Suggest substitutes for an ingredient. Use when user asks 'what can I use instead of X?', 'I don't have kajmak'.",
        schema: z.object({
          ingredient: z.string().describe("The ingredient to find a substitute for."),
        }),
      }
    ),
    tool(
      async ({ seconds }) => {
        const result = await handleSetTimer({ seconds });
        return JSON.stringify(result);
      },
      {
        name: "set_timer",
        description: "Set a kitchen timer. Use when user says 'timer for 5 minutes', 'remind me in 20 minutes'.",
        schema: z.object({
          seconds: z.number().describe("Duration in seconds (e.g. 300 for 5 minutes)."),
        }),
      }
    ),
    tool(
      async ({ recipeContent, targetLanguage }) => {
        const result = await handleTranslateRecipe({ recipeContent, targetLanguage });
        return JSON.stringify(result);
      },
      {
        name: "translate_recipe",
        description: "Translate a recipe to another language. Use when user says 'give me this in Croatian', 'translate to Serbian'.",
        schema: z.object({
          recipeContent: z.string().describe("The full recipe text."),
          targetLanguage: z.string().describe("Target language (e.g. 'Croatian', 'Serbian', 'English')."),
        }),
      }
    ),
    tool(
      async () => {
        const { handleGetTodaysMeals } = (await import("./chatTools")) as unknown as { handleGetTodaysMeals: (p: { userId: string }) => Promise<unknown> };
        const result = await handleGetTodaysMeals({ userId: uid });
        return JSON.stringify(result);
      },
      {
        name: "get_todays_meals",
        description:
          "Get what the user is eating today from their meal plan. Use when user asks 'what's for dinner?', 'what am I eating today?', 'what's for lunch?', 'show my plan for today', 'what's on my meal plan today'.",
        schema: z.object({}),
      }
    ),
    tool(
      async (input, config?: { writer?: (chunk: unknown) => void }) => {
        const { preferences, days, variety, slots, reuseLastWeek } = input as {
          preferences?: string;
          days?: number;
          variety?: string;
          slots?: string[];
          reuseLastWeek?: boolean;
        };
        config?.writer?.({ tool: "generate_meal_plan" });
        const result = await handleGenerateMealPlan({
          userId: uid,
          preferences: preferences || undefined,
          days: days ?? 7,
          variety: variety as "varied" | "same_every_day" | "same_every_week" | "leftovers" | "meal_prep_sunday" | undefined,
          slots: Array.isArray(slots) ? slots.filter((s) => ["breakfast", "lunch", "dinner", "snack"].includes(s)) as ("breakfast" | "lunch" | "dinner" | "snack")[] : undefined,
          reuseLastWeek,
          onProgress: (p) => config?.writer?.({ type: "meal_plan_progress", ...p }),
        } as Parameters<typeof handleGenerateMealPlan>[0]);
        return JSON.stringify(result);
      },
      {
        name: "generate_meal_plan",
        description:
          "Generate a 7-day meal plan. Call ONLY when user has confirmed they're ready (e.g. 'create it', 'go ahead') or given 2+ preferences. If they shared only one preference, ask a follow-up first—don't call yet. Pass preferences (their exact words) and days=7. Use variety/slots/reuseLastWeek when user specifies (e.g. 'same every day', 'just dinners', 'repeat last week').",
        schema: z.object({
          preferences: z.string().optional().describe("User's preferences in their own words—diet, cuisines, time limits, ingredients to use, etc. Required if they've shared any."),
          days: z.number().optional().describe("Always 7 for weekly plans."),
          variety: z.enum(["varied", "same_every_day", "same_every_week", "leftovers", "meal_prep_sunday"]).optional().describe("Plan structure: varied (default), same_every_day, same_every_week, leftovers, meal_prep_sunday."),
          slots: z.array(z.enum(["breakfast", "lunch", "dinner", "snack"])).optional().describe("Which meals to include. Default: breakfast, lunch, dinner."),
          reuseLastWeek: z.boolean().optional().describe("True to reuse last week's plan instead of generating new."),
        }),
      }
    ),
    tool(
      async ({ recipeContent, dayOfWeek }) => {
        const result = await handleAddToMealPlan({
          recipeContent,
          dayOfWeek,
          userId: uid,
        });
        return JSON.stringify(result);
      },
      {
        name: "add_to_meal_plan",
        description: "Add a recipe to the user's meal plan for a specific day. Use when user says 'add this to Saturday', 'put in my meal plan'.",
        schema: z.object({
          recipeContent: z.string().describe("The full recipe text."),
          dayOfWeek: z.string().describe("Day name: sunday, monday, tuesday, etc."),
        }),
      }
    ),
    tool(
      async ({ region }) => {
        const result = await handleSeasonalTips({ region: region ?? "balkan" });
        return JSON.stringify(result);
      },
      {
        name: "seasonal_tips",
        description: "Get seasonal produce tips. Use when user asks 'what's in season?', 'what's good now?'.",
        schema: z.object({
          region: z.string().optional().describe("'balkan' or 'northern' (default balkan)."),
        }),
      }
    ),
    tool(
      async ({ ingredients }) => {
        const result = await handleFindByIngredients({ ingredients, userId: uid });
        return JSON.stringify(result);
      },
      {
        name: "find_by_ingredients",
        description: "Find recipes that use given ingredients. Use when user says 'I have chicken, rice—what can I make?', 'recipes with these ingredients'.",
        schema: z.object({
          ingredients: z.array(z.string()).describe("List of ingredients the user has."),
        }),
      }
    ),
    tool(
      async ({ amount, fromUnit, toUnit }) => {
        const result = await handleUnitConversion({ amount, fromUnit, toUnit });
        return JSON.stringify(result);
      },
      {
        name: "unit_conversion",
        description: "Convert cooking units. Use when user asks 'how many cups is 200g flour?', 'convert 1 cup to ml', 'tbsp to tsp'.",
        schema: z.object({
          amount: z.number().describe("The numeric amount."),
          fromUnit: z.string().describe("Source unit (e.g. 'g', 'cups', 'ml')."),
          toUnit: z.string().describe("Target unit (e.g. 'cups', 'ml')."),
        }),
      }
    ),
  ];
}
