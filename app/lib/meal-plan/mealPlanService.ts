import { lazyOpenAI } from '../openai-client';
/**
 * Shared meal plan generation logic.
 * Used by: /api/meal-plan/send, /api/cron/meal-plans, and chat generate_meal_plan tool.
 */
import { serverDb, serverAuth } from "../backend/admin";
import OpenAI from 'openai';

const openai = lazyOpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getBaseUrl(): string {
  return `http://127.0.0.1:${process.env.PORT || 3001}`;
}

function formatPlanForEmail(
  parsed: {
    babaTip?: string;
    slots?: { timeSlot: string; recipeName: string; description: string }[];
    days?: { dayName: string; slots: { timeSlot: string; recipeName: string; description: string }[] }[];
    shoppingList?: string;
  },
  isWeekly: boolean
): string {
  const lines: string[] = [];
  if (isWeekly && parsed.days) {
    for (const day of parsed.days) {
      lines.push(`\n${day.dayName}:`);
      for (const s of day.slots || []) {
        lines.push(`  ${s.timeSlot.charAt(0).toUpperCase() + s.timeSlot.slice(1)}: ${s.recipeName} - ${s.description}`);
      }
    }
    if (parsed.shoppingList) lines.push(`\nSHOPPING LIST:\n${parsed.shoppingList}`);
  } else if (parsed.slots) {
    for (const s of parsed.slots) {
      lines.push(`${s.timeSlot.charAt(0).toUpperCase() + s.timeSlot.slice(1)}: ${s.recipeName} - ${s.description}`);
    }
  }
  if (parsed.babaTip) lines.push(`\nBaba Tip: ${parsed.babaTip}`);
  return lines.join('\n').trim();
}

export interface MealPlanProgress {
  day: number;
  dayName: string;
  recipeIndex: number;
  totalRecipes: number;
  recipeName: string;
  completedDays: number;
  timeSlot: string;
}

export type MealPlanVariety = 'varied' | 'same_every_day' | 'same_every_week' | 'leftovers' | 'meal_prep_sunday';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealPlanServiceOptions {
  userId: string;
  mealPlanPrompt?: string;
  ingredientsOnHand?: string;
  calorieTarget?: number;
  dietaryPreferences?: string[];
  preferredCookingOil?: string;
  type?: 'weekly' | 'daily';
  includeShoppingList?: boolean;
  source?: 'mealPlan' | 'chat' | 'cron';
  onProgress?: (p: MealPlanProgress) => void;
  /** Plan structure: varied (default), same_every_day, same_every_week, leftovers, meal_prep_sunday */
  variety?: MealPlanVariety;
  /** Which meal slots to include. Default: breakfast, lunch, dinner */
  slots?: MealSlot[];
  /** Reuse last week's plan (only for weekly). Overrides variety when true. */
  reuseLastWeek?: boolean;
}

export interface MealPlanServiceResult {
  planId: string;
  plainContent: string;
  planTextWithLinks: string;
  storedDays: { day: number; dayName: string; slots: { timeSlot: string; recipeId: string; recipeName: string; description: string }[] }[];
  storedSlots: { timeSlot: string; recipeId: string; recipeName: string; description: string }[];
  babaTip: string;
  shoppingList?: string;
}

const DEFAULT_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export async function generateMealPlanWithRecipes(
  options: MealPlanServiceOptions
): Promise<MealPlanServiceResult> {
  const {
    userId,
    mealPlanPrompt = '',
    ingredientsOnHand = '',
    calorieTarget,
    dietaryPreferences = [],
    preferredCookingOil = 'olive oil',
    type = 'weekly',
    includeShoppingList = true,
    source = 'mealPlan',
    onProgress,
    variety = 'varied',
    slots: requestedSlots,
    reuseLastWeek = false,
  } = options;

  const slots = (requestedSlots?.length ? requestedSlots : DEFAULT_SLOTS).filter((s) =>
    ALL_SLOTS.includes(s)
  ) as MealSlot[];
  const slotList = slots.join(', ');

  const database = serverDb;
  const historyCol = database.collection('users').doc(userId).collection('mealPlanHistory');

  // Reuse last week: clone most recent weekly plan
  if (type === 'weekly' && reuseLastWeek) {
    const lastPlansSnap = await historyCol.where('type', '==', 'weekly').limit(20).get();
    const sorted = lastPlansSnap.docs.sort((a, b) => {
      const aT = (a.data().createdAt as { toDate?: () => Date })?.toDate?.()?.getTime?.() ?? 0;
      const bT = (b.data().createdAt as { toDate?: () => Date })?.toDate?.()?.getTime?.() ?? 0;
      return bT - aT;
    });
    const lastDoc = sorted[0];
    if (lastDoc?.exists) {
      const data = lastDoc.data();
      const days = data.days as { day: number; dayName: string; slots: { timeSlot: string; recipeId: string; recipeName: string; description: string }[] }[];
      if (Array.isArray(days) && days.length > 0) {
        const filteredDays = days.map((d) => ({
          ...d,
          slots: (d.slots || []).filter((s) => slots.includes(s.timeSlot as MealSlot)),
        })).filter((d) => d.slots.length > 0);
        if (filteredDays.length > 0) {
          const babaTip = data.babaTip || '';
          const shoppingList = data.shoppingList;
          const linkLines: string[] = [];
          for (const day of filteredDays) {
            const dayLines = [`**Day ${day.day}: ${day.dayName}**`];
            for (const slot of day.slots) {
              dayLines.push(`  ${slot.timeSlot.charAt(0).toUpperCase() + slot.timeSlot.slice(1)}: [${slot.recipeName}](/recipe/${slot.recipeId}) - ${slot.description}`);
            }
            linkLines.push(dayLines.join('\n'));
          }
          if (babaTip) linkLines.push(`\n**Baba's Tip:** ${babaTip}`);
          if (shoppingList) {
            const slStr = typeof shoppingList === 'string' ? shoppingList : Object.entries(shoppingList)
              .map(([cat, val]) => `${cat.charAt(0).toUpperCase() + cat.slice(1)}:\n${Array.isArray(val) ? val.join('\n') : val}`)
              .join('\n\n');
            linkLines.push(`\n**Shopping List:**\n${slStr}`);
          }
          const plainContent = formatPlanForEmail(
            { ...data, days: filteredDays, shoppingList },
            true
          );
          const historyRef = await historyCol.add({
            type: 'weekly',
            content: plainContent,
            subject: "Baba Selo's Weekly Meal Plan",
            babaTip,
            slots: [],
            days: filteredDays,
            shoppingList: shoppingList ?? null,
            source: source || 'mealPlan',
            createdAt: serverDb.transforms.serverTimestamp(),
          });
          return {
            planId: historyRef.id,
            plainContent,
            planTextWithLinks: linkLines.join('\n\n'),
            storedDays: filteredDays,
            storedSlots: [],
            babaTip,
            shoppingList: typeof shoppingList === 'string' ? shoppingList : (shoppingList ? Object.entries(shoppingList).map(([cat, val]) => `${cat.charAt(0).toUpperCase() + cat.slice(1)}:\n${Array.isArray(val) ? val.join('\n') : val}`).join('\n\n') : undefined),
          };
        }
      }
    }
    // Fall through to generate if no last plan
  }

  const preferenceContext = mealPlanPrompt.trim()
    ? `The user's preferences (in their own words): ${mealPlanPrompt.trim()}`
    : `Use ${preferredCookingOil}. Dietary: ${(dietaryPreferences as string[]).join(', ') || 'none'}.`;

  const ingredientsContext = ingredientsOnHand.trim()
    ? ` The user has these ingredients on hand—prioritize recipes that use them: ${ingredientsOnHand.trim()}.`
    : '';

  const calorieContext =
    calorieTarget && typeof calorieTarget === 'number' && calorieTarget >= 800 && calorieTarget <= 4000
      ? ` CALORIE TARGET: The user aims for approximately ${calorieTarget} calories per day. Choose dishes that fit within this budget. Typical splits: breakfast ~${Math.round(calorieTarget * 0.2)}, lunch ~${Math.round(calorieTarget * 0.35)}, dinner ~${Math.round(calorieTarget * 0.4)}, snack ~${Math.round(calorieTarget * 0.05)}. Prefer lighter dishes if needed to stay within the target.`
      : '';

  const isWeekly = type === 'weekly';

  const varietyInstructions: Record<MealPlanVariety, string> = {
    varied: 'Create a 7-day weekly meal plan with variety—different meals each day.',
    same_every_day: 'Create ONE day of meals. The same meals will be repeated every day of the week. Design one balanced day.',
    same_every_week: 'Create a 7-day weekly meal plan with variety.',
    leftovers: 'Create a plan where the user cooks 2-3 large dinners and eats the same dinner 2-3 times. E.g. Monday/Tuesday same dinner, Wednesday/Thursday same, Friday/Saturday same. Breakfast and lunch can vary or repeat. Minimize cooking days.',
    meal_prep_sunday: 'Create a plan where the user meal preps on Sunday: the SAME lunch is eaten Monday-Friday. Dinners vary each night. Breakfast can be simple/repeat.',
  };

  const systemContent = isWeekly
    ? (variety === 'same_every_day'
      ? `You are Baba Selo. ${varietyInstructions.same_every_day} Return a JSON object with this exact structure (no other text):
{
  "babaTip": "A warm Baba tip at the end",
  "days": [
    { "day": 1, "dayName": "Monday", "slots": [
      ${slots.map((s) => `{ "timeSlot": "${s}", "recipeName": "Dish name", "description": "Brief description" }`).join(',\n      ')}
    ]}
  ]
}
NOTE: Only ONE day. It will be duplicated for all 7 days.
${preferenceContext}${ingredientsContext}${calorieContext}`
      : `You are Baba Selo. ${varietyInstructions[variety]} Return a JSON object with this exact structure (no other text):
{
  "babaTip": "A warm Baba tip at the end",
  "days": [
    { "day": 1, "dayName": "Monday", "slots": [
      ${slots.map((s) => `{ "timeSlot": "${s}", "recipeName": "Dish name", "description": "Brief description" }`).join(',\n      ')}
    ]},
    ...repeat for days 2-7 (Tuesday through Sunday). ${variety === 'leftovers' ? 'Reuse dinner recipes across 2-3 days as described.' : variety === 'meal_prep_sunday' ? 'Same lunch for days 1-5, varied dinners.' : ''}
  ]
}
Include only these slots: ${slotList}.
${preferenceContext}${ingredientsContext}${calorieContext}`)
    : `You are Baba Selo. Create a daily meal plan. Return a JSON object with this exact structure (no other text):
{
  "babaTip": "A warm Baba tip at the end",
  "slots": [
    ${slots.map((s) => `{ "timeSlot": "${s}", "recipeName": "Dish name", "description": "Brief description" }`).join(',\n    ')}
  ]
}
Include only these slots: ${slotList}.
${preferenceContext}${ingredientsContext}${calorieContext}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: isWeekly ? 4000 : 2500,
    temperature: 0.8,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: isWeekly ? "This week's meal plan, please!" : "Today's meal plan, please!" },
    ],
  });

  const rawContent = completion.choices?.[0]?.message?.content || '{}';
  let parsed: {
    babaTip?: string;
    slots?: { timeSlot: string; recipeName: string; description: string }[];
    days?: { day: number; dayName: string; slots: { timeSlot: string; recipeName: string; description: string }[] }[];
    shoppingList?: string;
  };
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    parsed = { babaTip: rawContent, slots: [] };
  }

  // same_every_day: duplicate 1 day to 7
  if (isWeekly && variety === 'same_every_day' && parsed.days?.length === 1) {
    const template = parsed.days[0];
    parsed.days = DAY_NAMES.map((dayName, i) => ({
      day: i + 1,
      dayName,
      slots: [...(template.slots || [])],
    }));
  }

  // Filter slots to only requested ones
  const filterSlots = <T extends { timeSlot: string }>(arr: T[]) =>
    arr.filter((s) => slots.includes(s.timeSlot as MealSlot));
  if (parsed.days) {
    parsed.days = parsed.days.map((d) => ({ ...d, slots: filterSlots(d.slots || []) }));
  }
  if (parsed.slots) {
    parsed.slots = filterSlots(parsed.slots);
  }

  const recipesCol = database.collection('recipes');
  const baseUrl = getBaseUrl();

  const createRecipe = async (recipeName: string, description: string): Promise<{ recipeId: string; ingredients: string[] }> => {
    const recipeContent = `${recipeName}\n\nDescription: ${description}`;
    let details: {
      ingredients?: string[];
      directions?: string[];
      cuisineType?: string;
      cookingDifficulty?: string;
      cookingTime?: string;
      diet?: string[];
      recipeSummary?: string;
      macroInfo?: unknown;
      dishPairings?: string;
    } | null = null;

    try {
      const genRes = await fetch(`${baseUrl}/api/generateRecipeDetails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeTitle: recipeName, recipeContent, generateAll: true, skipMacroAndPairing: true }),
      });
      if (genRes.ok) {
        details = await genRes.json();
      }
    } catch (e) {
      console.error('Failed to generate recipe details for', recipeName, e);
    }

    const ingredients = details?.ingredients?.length ? details.ingredients : [description];
    const directions = details?.directions?.length ? details.directions : [description];
    const recipeContentFull = `${recipeName}\n\nIngredients:\n${ingredients.map((i) => `- ${i}`).join('\n')}\n\nDirections:\n${directions.map((d, i) => `${i + 1}. ${d}`).join('\n')}`;

    // Skip macroInfo and dishPairings for meal plan recipes (saves API calls)
    const recipeRef = await recipesCol.add({
      recipeTitle: recipeName,
      recipeContent: recipeContentFull,
      ingredients,
      directions,
      userId,
      cuisineType: details?.cuisineType || 'General',
      cookingDifficulty: details?.cookingDifficulty || 'medium',
      cookingTime: details?.cookingTime || '30 min',
      diet: Array.isArray(details?.diet) ? details.diet : [],
      source: 'mealPlan',
      mealPlanDescription: description,
      recipeSummary: details?.recipeSummary || '',
      createdAt: serverDb.transforms.serverTimestamp(),
    });
    return { recipeId: recipeRef.id, ingredients };
  };

  const storedSlots: { timeSlot: string; recipeId: string; recipeName: string; description: string }[] = [];
  const storedDays: { day: number; dayName: string; slots: { timeSlot: string; recipeId: string; recipeName: string; description: string }[] }[] = [];
  const linkLines: string[] = [];
  const allIngredients: string[] = [];

  // For same_every_day: only create recipes once (day 1), reuse for days 2-7
  const isSameEveryDay = isWeekly && variety === 'same_every_day' && parsed.days?.length > 0;
  const totalRecipes = isWeekly && parsed.days?.length
    ? (isSameEveryDay ? (parsed.days[0]?.slots?.length || 0) : parsed.days.reduce((sum, d) => sum + (d.slots?.length || 0), 0))
    : (parsed.slots?.length || 0);

  if (isWeekly && parsed.days?.length) {
    let recipeIndex = 0;
    const recipeCache = new Map<string, { recipeId: string; ingredients: string[] }>(); // key: `${recipeName}|${description}`

    for (const day of parsed.days) {
      const daySlots: { timeSlot: string; recipeId: string; recipeName: string; description: string }[] = [];
      const dayLines = [`**Day ${day.day}: ${day.dayName}**`];

      for (const slot of day.slots || []) {
        const cacheKey = `${slot.recipeName}|${slot.description}`;
        let result: { recipeId: string; ingredients: string[] };

        if (isSameEveryDay && recipeCache.has(cacheKey)) {
          result = recipeCache.get(cacheKey)!;
        } else {
          onProgress?.({
            day: day.day,
            dayName: day.dayName,
            recipeIndex: recipeIndex + 1,
            totalRecipes,
            recipeName: slot.recipeName,
            completedDays: storedDays.length,
            timeSlot: slot.timeSlot,
          });
          result = await createRecipe(slot.recipeName, slot.description);
          if (isSameEveryDay) recipeCache.set(cacheKey, result);
          recipeIndex++;
        }

        const { recipeId, ingredients } = result;
        allIngredients.push(...ingredients);
        daySlots.push({ timeSlot: slot.timeSlot, recipeId, recipeName: slot.recipeName, description: slot.description });
        const link = `[${slot.recipeName}](/recipe/${recipeId})`;
        dayLines.push(`  ${slot.timeSlot.charAt(0).toUpperCase() + slot.timeSlot.slice(1)}: ${link} - ${slot.description}`);
      }

      storedDays.push({ day: day.day, dayName: day.dayName, slots: daySlots });
      linkLines.push(dayLines.join('\n'));
    }
  } else if (parsed.slots?.length) {
    let recipeIndex = 0;
    for (const slot of parsed.slots) {
      onProgress?.({
        day: 1,
        dayName: 'Today',
        recipeIndex: recipeIndex + 1,
        totalRecipes,
        recipeName: slot.recipeName,
        completedDays: 0,
        timeSlot: slot.timeSlot,
      });
      const { recipeId, ingredients } = await createRecipe(slot.recipeName, slot.description);
      allIngredients.push(...ingredients);
      recipeIndex++;
      storedSlots.push({ timeSlot: slot.timeSlot, recipeId, recipeName: slot.recipeName, description: slot.description });
      const link = `[${slot.recipeName}](/recipe/${recipeId})`;
      linkLines.push(`  ${slot.timeSlot.charAt(0).toUpperCase() + slot.timeSlot.slice(1)}: ${link} - ${slot.description}`);
    }
  }

  let shoppingList: string | Record<string, string | string[]> | undefined;
  if (includeShoppingList && allIngredients.length > 0) {
    try {
      const consolidateRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant that consolidates recipe ingredients into a shopping list. Given a list of ingredients from multiple recipes (each with quantity/amount), create a consolidated shopping list. Combine duplicate ingredients and add their amounts where sensible (e.g. "2 tbsp olive oil" + "3 tbsp olive oil" = "5 tbsp olive oil"). Group by category: Produce, Dairy, Protein, Pantry, Bakery, etc. Return JSON: { "produce": "item1\\nitem2", "dairy": "...", "protein": "...", "pantry": "...", "bakery": "..." } - use category keys as needed. Each line must include the amount (e.g. "2 cups rice", "1 lb chicken").`,
          },
          {
            role: 'user',
            content: `Consolidate these ingredients into a shopping list with amounts:\n\n${allIngredients.map((i) => `- ${i}`).join('\n')}`,
          },
        ],
      });
      const raw = consolidateRes.choices?.[0]?.message?.content || '{}';
      const consolidated = JSON.parse(raw) as Record<string, string | string[]>;
      if (typeof consolidated === 'object' && Object.keys(consolidated).length > 0) {
        shoppingList = consolidated;
      } else {
        shoppingList = allIngredients.join('\n');
      }
    } catch (e) {
      console.error('Failed to consolidate shopping list:', e);
      shoppingList = allIngredients.join('\n');
    }
  }

  if (parsed.babaTip) linkLines.push(`\n**Baba's Tip:** ${parsed.babaTip}`);
  if (shoppingList) {
    const slStr = typeof shoppingList === 'string' ? shoppingList : Object.entries(shoppingList)
      .map(([cat, val]) => `${cat.charAt(0).toUpperCase() + cat.slice(1)}:\n${Array.isArray(val) ? val.join('\n') : val}`)
      .join('\n\n');
    linkLines.push(`\n**Shopping List:**\n${slStr}`);
  }

  const parsedForEmail = { ...parsed, shoppingList: shoppingList ? (typeof shoppingList === 'string' ? shoppingList : Object.entries(shoppingList).map(([cat, val]) => `${cat.charAt(0).toUpperCase() + cat.slice(1)}:\n${Array.isArray(val) ? val.join('\n') : val}`).join('\n\n')) : undefined };
  const plainContent = formatPlanForEmail(parsedForEmail, isWeekly) || rawContent;
  const planTextWithLinks = linkLines.join('\n\n');

  const subject = isWeekly ? "Baba Selo's Weekly Meal Plan" : "Baba Selo's Daily Meal Plan";
  const historyDoc: Record<string, unknown> = {
    type: isWeekly ? 'weekly' : 'daily',
    content: plainContent,
    subject,
    babaTip: parsed.babaTip || '',
    slots: storedSlots,
    days: storedDays,
    source,
    createdAt: serverDb.transforms.serverTimestamp(),
  };
  if (shoppingList != null) historyDoc.shoppingList = shoppingList;

  const historyRef = await historyCol.add(historyDoc);

  return {
    planId: historyRef.id,
    plainContent,
    planTextWithLinks,
    storedDays,
    storedSlots,
    babaTip: parsed.babaTip || '',
    shoppingList: typeof shoppingList === 'string' ? shoppingList : (shoppingList ? Object.entries(shoppingList).map(([cat, val]) => `${cat.charAt(0).toUpperCase() + cat.slice(1)}:\n${Array.isArray(val) ? val.join('\n') : val}`).join('\n\n') : undefined),
  };
}
