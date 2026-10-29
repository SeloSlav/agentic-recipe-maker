import { MODELS } from '../models';
import { lazyAIClient } from '../ai-client';
/**
 * Shared meal plan generation logic for API routes and chat tools.
 */
import OpenAI from 'openai';

const ai = lazyAIClient();

export interface MealPlanOptions {
  mealPlanPrompt?: string;
  dietaryPreferences?: string[];
  preferredCookingOil?: string;
  days?: number;
}

export async function generateMealPlan(options: MealPlanOptions): Promise<string> {
  const {
    mealPlanPrompt = '',
    dietaryPreferences = [],
    preferredCookingOil = 'olive oil',
    days = 7,
  } = options;

  const prefs = Array.isArray(dietaryPreferences) ? dietaryPreferences : [];
  const oil = String(preferredCookingOil || 'olive oil');
  const numDays = Math.min(Math.max(1, Number(days) || 1), 7);

  const preferenceContext = mealPlanPrompt.trim()
    ? `The user's preferences (in their own words): ${mealPlanPrompt.trim()}`
    : `Use ${oil} as the primary cooking oil. Respect dietary preferences: ${prefs.join(', ') || 'none specified'}.`;

  const completion = await ai.chat.completions.create({
    model: MODELS.recipeGeneration,
    max_tokens: 2000,
    temperature: 0.8,
    messages: [
      {
        role: 'system',
        content: `You are Baba Selo, a warm grandmother from Eastern Europe who loves to plan meals. Create a personalized meal plan in a friendly, grandmotherly tone.

Format your response as:
- Day 1: [day name]
  Breakfast: [dish name] - [brief description]
  Lunch: [dish name] - [brief description]
  Dinner: [dish name] - [brief description]
  Snack (optional): [suggestion]

Repeat for each day. ${preferenceContext} Keep each meal description to 1-2 sentences. Add a short Baba-style tip at the end.`,
      },
      {
        role: 'user',
        content: `Create a ${numDays}-day meal plan for me, dear.`,
      },
    ],
  });

  return completion.choices?.[0]?.message?.content || '';
}
