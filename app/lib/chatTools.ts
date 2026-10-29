/**
 * Chat tool handlers for Baba Selo.
 * Each function is called when the AI invokes the corresponding tool.
 */

import { serverDb, serverAuth } from "./backend/admin";
import { ChatOpenAI } from '@langchain/openai';
import { MODELS } from './models';

const adminDb = serverDb;

const translationModel = new ChatOpenAI({
  model: MODELS.translation,
  temperature: 0.3,
  maxTokens: 2000,
});

interface ParsedRecipe {
  recipeTitle: string;
  ingredients: string[];
  directions: string[];
}

function parseRecipe(text: string): ParsedRecipe {
  const raw = (text || '').trim();
  const lower = raw.toLowerCase();
  const ingPos = lower.indexOf('ingredients');
  const dirPos = lower.indexOf('directions');
  if (ingPos === -1 || dirPos === -1 || dirPos <= ingPos) {
    return { recipeTitle: raw.split('\n')[0]?.trim() || 'Untitled Recipe', ingredients: [], directions: [] };
  }
  const ingredientsBlock = raw.slice(ingPos + 11, dirPos).trim();
  const directionsBlock = raw.slice(dirPos + 10).trim();
  const ingredients: string[] = [];
  for (const line of ingredientsBlock.split('\n')) {
    const parts = line.split(/(?=\s*[-•*]\s+)/);
    for (const p of parts) {
      const cleaned = p.replace(/^[\s\-•*]+\s*/, '').trim();
      if (cleaned && !cleaned.toLowerCase().startsWith('equipment') && cleaned.length > 2) {
        ingredients.push(cleaned);
      }
    }
  }
  const directions: string[] = [];
  for (const line of directionsBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cleaned = trimmed.replace(/^\d+[\.\)]\s*/, '').replace(/^[\-•*]\s*/, '').trim();
    if (cleaned && cleaned.length > 2) {
      directions.push(cleaned);
    }
  }
  const beforeIng = raw.slice(0, ingPos);
  const titleMatch = beforeIng.match(/([A-Za-z][^:\n]+(?:\([^)]+\))?)\s*Ingredients?/i) || beforeIng.match(/(?:^|[:.\n])\s*([^\n:]+?)\s*$/);
  let recipeTitle = (titleMatch ? titleMatch[1].trim() : beforeIng.split('\n').pop()?.trim() || raw.split('\n')[0]?.trim() || 'Untitled Recipe');
  recipeTitle = recipeTitle.replace(/^Ah,?\s+[\w\s!.,]+:\s*/i, '').replace(/\s+Ingredients?\s*:?\s*$/i, '').trim();
  return { recipeTitle: recipeTitle || 'Untitled Recipe', ingredients, directions };
}

export async function handleSaveRecipe({ recipeContent, userId, classification }: { recipeContent: string; userId: string; classification?: { cuisine?: string; difficulty?: string; cooking_time?: string; diet?: string[] } }) {
  if (!userId || userId === 'anonymous') {
    return { success: false, error: 'User must be logged in to save recipes.' };
  }
  if (!recipeContent || !recipeContent.trim()) {
    return { success: false, error: 'No recipe content to save.' };
  }
  try {
    const parsed = parseRecipe(recipeContent);
    const docId = `${userId}-${Date.now()}`;
    const newRecipe = {
      ...parsed,
      userId,
      cuisineType: classification?.cuisine || 'Unknown',
      cookingDifficulty: classification?.difficulty || 'Unknown',
      cookingTime: classification?.cooking_time || 'Unknown',
      diet: Array.isArray(classification?.diet) ? classification.diet : [],
      createdAt: serverDb.transforms.serverTimestamp(),
    };
    await adminDb.collection('recipes').doc(docId).set(newRecipe);
    try {
      const { indexRecipe } = await import('./stores/similarRecipesStore');
      await indexRecipe({
        id: docId,
        recipeTitle: newRecipe.recipeTitle,
        userId,
        cuisineType: newRecipe.cuisineType,
        cookingDifficulty: newRecipe.cookingDifficulty,
        cookingTime: newRecipe.cookingTime,
        diet: newRecipe.diet,
        ingredients: newRecipe.ingredients || [],
        directions: newRecipe.directions || [],
      });
    } catch (e) {
      console.error('Recipe index error (non-fatal):', e);
    }
    return { success: true, recipeId: docId, title: newRecipe.recipeTitle };
  } catch (err) {
    console.error('Save recipe error:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function handleGetSimilarRecipes({ recipeText, limit = 3 }: { recipeText: string; limit?: number }) {
  if (!recipeText || !recipeText.trim()) {
    return { similar: [], error: 'No recipe text provided.' };
  }
  try {
    const { getSimilarRecipes, recipeToSearchText } = await import('./stores/similarRecipesStore');
    const parsed = parseRecipe(recipeText);
    const searchText = recipeToSearchText({
      ingredients: parsed.ingredients,
      directions: parsed.directions,
    });
    const options =
      searchText.trim() && parsed.recipeTitle
        ? { sourceTitle: parsed.recipeTitle, searchText }
        : undefined;
    const results = await getSimilarRecipes(
      'chat-search',
      searchText.trim() || recipeText,
      Math.min(limit, 5),
      options
    );
    return {
      similar: results.map((r: { id: string; recipeTitle: string; cuisineType?: string }) => ({
        id: r.id,
        title: r.recipeTitle,
        cuisineType: r.cuisineType,
        url: `https://www.babaselo.com/recipe/${r.id}`,
      })),
    };
  } catch (err) {
    console.error('Similar recipes error:', err);
    return { similar: [], error: (err as Error).message };
  }
}

export async function handleConvertServings({ recipeContent, targetServings }: { recipeContent: string; targetServings: number }) {
  if (!recipeContent || !targetServings || targetServings < 1) {
    return { success: false, error: 'Need recipe content and valid target servings.' };
  }
  const parsed = parseRecipe(recipeContent);
  const lines = recipeContent.split('\n');
  const ingPos = lines.findIndex((l) => l.toLowerCase().includes('ingredients'));
  const dirPos = lines.findIndex((l) => l.toLowerCase().includes('directions'));
  if (ingPos === -1 || dirPos === -1) {
    return { success: false, error: 'Could not parse recipe structure.' };
  }
  let originalServings = 4;
  const serveMatch = recipeContent.match(/(?:serves?|portions?|yield)\s*(\d+)/i) || recipeContent.match(/(\d+)\s*(?:servings?|portions?|people)/i);
  if (serveMatch) originalServings = parseInt(serveMatch[1], 10) || 4;
  const factor = targetServings / originalServings;
  const scaledIngredients = parsed.ingredients.map((ing) => {
    const match = ing.match(/^([\d./\s]+)\s*(.*)$/);
    if (!match) return ing;
    const [, amountStr, rest] = match;
    const parts = amountStr.replace(/\s+/g, ' ').trim().split(' ');
    let num = 1;
    let denom = 1;
    if (parts[0]) {
      const frac = parts[0].split('/');
      if (frac.length === 2) {
        num = parseFloat(frac[0]) || 1;
        denom = parseFloat(frac[1]) || 1;
      } else {
        num = parseFloat(parts[0]) || 1;
      }
    }
    const scaled = (num / denom) * factor;
    const rounded = Math.round(scaled * 4) / 4;
    const display = rounded >= 1 ? String(rounded) : `${Math.round(scaled * 4) / 4}`;
    return `${display} ${rest}`.trim();
  });
  const newRecipe = [
    parsed.recipeTitle,
    '',
    `(Scaled for ${targetServings} servings; originally ${originalServings})`,
    '',
    'Ingredients',
    ...scaledIngredients.map((i) => `- ${i}`),
    '',
    'Directions',
    ...parsed.directions.map((d, i) => `${i + 1}. ${d}`),
  ].join('\n');
  return { success: true, scaledRecipe: newRecipe, originalServings, targetServings };
}

export async function handleGetNutrition({ recipeContent }: { recipeContent: string }) {
  if (!recipeContent || !recipeContent.trim()) {
    return { success: false, error: 'No recipe content.' };
  }
  try {
    const baseUrl = `http://127.0.0.1:${process.env.PORT || 3001}`;
    const res = await fetch(`${baseUrl}/api/macroInfo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe: recipeContent }),
    });
    const data = await res.json();
    if (!res.ok || !data.macros) {
      return { success: false, error: data.error || 'Failed to get nutrition.' };
    }
    return { success: true, macros: data.macros };
  } catch (err) {
    console.error('Get nutrition error:', err);
    return { success: false, error: (err as Error).message };
  }
}

const BALKAN_SUBSTITUTIONS: Record<string, string[]> = {
  kajmak: ['cream cheese', 'mascarpone', 'clotted cream', 'sour cream mixed with butter'],
  'sour cream': ['Greek yogurt', 'crème fraîche', 'buttermilk', 'kajmak'],
  ajvar: ['roasted red pepper spread', 'harissa', 'tomato paste with roasted peppers'],
  'phyllo dough': ['puff pastry', 'filo pastry', 'yufka'],
  rakija: ['grappa', 'slivovitz', 'fruit brandy'],
  'smoked paprika': ['sweet paprika', 'regular paprika', 'cayenne (less)'],
  'vegetable oil': ['olive oil', 'sunflower oil', 'canola oil'],
  'olive oil': ['vegetable oil', 'sunflower oil', 'avocado oil'],
  feta: ['goat cheese', 'cottage cheese', 'ricotta salata'],
  'cottage cheese': ['ricotta', 'farmer cheese', 'quark'],
};

export async function handleIngredientSubstitution({ ingredient }: { ingredient: string }) {
  const lower = (ingredient || '').toLowerCase().trim();
  if (!lower) return { success: false, error: 'No ingredient specified.' };
  for (const [key, subs] of Object.entries(BALKAN_SUBSTITUTIONS)) {
    if (lower.includes(key)) {
      return { success: true, ingredient: key, substitutions: subs };
    }
  }
  return { success: false, error: `No substitution for "${ingredient}" in my book. Try asking Baba in your own words!` };
}

export async function handleSetTimer({ seconds }: { seconds: number }) {
  const s = Math.max(5, Math.min(7200, parseInt(String(seconds), 10) || 60));
  return { success: true, seconds: s, message: `Timer set for ${s} seconds.` };
}

export async function handleTranslateRecipe({ recipeContent, targetLanguage }: { recipeContent: string; targetLanguage: string }) {
  if (!recipeContent || !targetLanguage) {
    return { success: false, error: 'Need recipe and target language.' };
  }
  try {
    const response = await translationModel.invoke([
      {
        role: 'system',
        content: `You are a recipe translator. Translate the given recipe into ${targetLanguage}. Keep the exact same structure: recipe name first, then Ingredients, then Directions. Preserve formatting (bullets, numbers). Do not add commentary. Output only the translated recipe.`,
      },
      { role: 'user', content: recipeContent },
    ]);
    const translated = typeof response.content === 'string' ? response.content : '';
    if (!translated) return { success: false, error: 'Translation failed.' };
    return { success: true, translatedRecipe: translated, targetLanguage };
  } catch (err) {
    console.error('Translate error:', err);
    return { success: false, error: (err as Error).message };
  }
}

function extractBabaTip(plan: string): string {
  const match = (plan || '').match(/Baba'?s?\s*Tip\s*:?\s*([\s\S]+?)(?:\n|$)/i);
  return match ? match[1].trim() : '';
}

export type MealPlanProgressCallback = (p: {
  recipeIndex: number;
  totalRecipes: number;
  recipeName: string;
  dayName: string;
  completedDays: number;
  timeSlot: string;
}) => void;

export type HandleGenerateMealPlanParams = {
  userId: string;
  preferences?: string;
  days?: number;
  variety?: 'varied' | 'same_every_day' | 'same_every_week' | 'leftovers' | 'meal_prep_sunday';
  slots?: ('breakfast' | 'lunch' | 'dinner' | 'snack')[];
  reuseLastWeek?: boolean;
  onProgress?: MealPlanProgressCallback;
};

export async function handleGenerateMealPlan({
  userId,
  preferences,
  days = 7,
  variety,
  slots,
  reuseLastWeek,
  onProgress,
}: HandleGenerateMealPlanParams) {
  if (!userId || userId === 'anonymous') {
    return { success: false, error: 'Sign in to create and save meal plans. Your plans will be saved with clickable recipe links!' };
  }
  try {
    let mealPlanPrompt = (preferences || '').trim();
    let dietaryPreferences: string[] = [];
    let preferredCookingOil = 'olive oil';

    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc?.data() || {};
    if (!mealPlanPrompt) mealPlanPrompt = (userData.mealPlanPrompt || '').trim();
    dietaryPreferences = Array.isArray(userData.dietaryPreferences) ? userData.dietaryPreferences : [];
    preferredCookingOil = userData.preferredCookingOil || 'olive oil';

    const numDays = Math.min(Math.max(1, parseInt(String(days), 10) || 7), 7);

    try {
      const { generateMealPlanWithRecipes } = await import('./meal-plan/mealPlanService');
      const result = await generateMealPlanWithRecipes({
        userId,
        mealPlanPrompt,
        ingredientsOnHand: (userData.ingredientsOnHand || '').trim(),
        calorieTarget: userData.mealPlanCalorieTarget,
        dietaryPreferences,
        preferredCookingOil,
        type: 'weekly',
        includeShoppingList: true,
        source: 'chat',
        variety,
        slots,
        reuseLastWeek,
        onProgress,
      });

      const plan = result.planTextWithLinks;
      const planId = result.planId;
      return { success: true, mealPlan: plan || '', planId };
    } catch (e) {
      console.error('Structured meal plan failed, falling back to simple:', e);
      const { generateMealPlan } = await import('./meal-plan/mealPlanGenerator');
      const plan = await generateMealPlan({
        mealPlanPrompt,
        dietaryPreferences,
        preferredCookingOil,
        days: numDays,
      });
      if (plan) {
        const historyCol = adminDb.collection('users').doc(userId).collection('mealPlanHistory');
        const historyRef = await historyCol.add({
          type: 'weekly',
          content: plan,
          subject: "Baba Selo's Weekly Meal Plan",
          babaTip: extractBabaTip(plan) || '',
          source: 'chat',
          createdAt: serverDb.transforms.serverTimestamp(),
        });
        return { success: true, mealPlan: plan, planId: historyRef.id };
      }
      return { success: true, mealPlan: '', planId: null };
    }
  } catch (err) {
    console.error('Generate meal plan error:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function handleGetTodaysMeals({ userId }: { userId: string }) {
  if (!userId || userId === 'anonymous') {
    return { success: false, error: 'Sign in to see your meal plan!', meals: [] };
  }
  try {
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc?.data() || {};
    const activePlanId = userData.activePlanId as string | undefined;
    const activePlanStartDay = (userData.activePlanStartDay as number) ?? 1; // 0=Sun, 1=Mon, ..., 6=Sat

    let planDoc: { exists: boolean; id: string; data: () => Record<string, unknown> | undefined } | null = null;
    if (activePlanId) {
      const snap = await adminDb.collection('users').doc(userId).collection('mealPlanHistory').doc(activePlanId).get();
      if (snap.exists) planDoc = snap;
    }
    if (!planDoc?.exists) {
      const recent = await adminDb.collection('users').doc(userId).collection('mealPlanHistory')
        .where('type', '==', 'weekly')
        .limit(1)
        .get();
      const sorted = recent.docs.sort((a, b) => {
        const aT = (a.data().createdAt as { toDate?: () => Date })?.toDate?.()?.getTime?.() ?? 0;
        const bT = (b.data().createdAt as { toDate?: () => Date })?.toDate?.()?.getTime?.() ?? 0;
        return bT - aT;
      });
      if (sorted[0]?.exists) planDoc = sorted[0];
    }
    if (!planDoc?.exists) {
      return { success: true, meals: [], message: "You don't have a meal plan yet. Ask me to create one!" };
    }

    const data = planDoc.data();
    const days = data?.days as { day: number; dayName: string; slots: { timeSlot: string; recipeId: string; recipeName: string; description: string }[] }[] | undefined;
    if (!Array.isArray(days) || days.length === 0) {
      return { success: true, meals: [], message: "Your plan doesn't have daily meals." };
    }

    const now = new Date();
    const todayWeekday = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const planDayIndex = ((todayWeekday - activePlanStartDay + 7) % 7) + 1;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayData = days.find((d) => d.day === planDayIndex);
    return {
      success: true,
      meals: dayData?.slots ?? [],
      dayName: dayNames[todayWeekday],
      planId: planDoc.id,
    };
  } catch (err) {
    console.error('Get todays meals error:', err);
    return { success: false, error: (err as Error).message, meals: [] };
  }
}

export async function handleAddToMealPlan({ recipeContent, dayOfWeek, userId }: { recipeContent: string; dayOfWeek: string; userId: string }) {
  if (!userId || userId === 'anonymous') {
    return { success: false, error: 'Sign in to add recipes to your meal plan!' };
  }
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const day = (dayOfWeek || 'saturday').toLowerCase();
  const dayIndex = days.findIndex((d) => d.startsWith(day));
  const normalizedDay = dayIndex >= 0 ? days[dayIndex] : 'saturday';
  const parsed = parseRecipe(recipeContent);
  try {
    const docRef = adminDb.collection('users').doc(userId).collection('mealPlanPins').doc(normalizedDay);
    await docRef.set(
      {
        recipeTitle: parsed.recipeTitle,
        recipeContent,
        ingredients: parsed.ingredients,
        directions: parsed.directions,
        updatedAt: serverDb.transforms.serverTimestamp(),
      },
      { merge: true }
    );
    return { success: true, day: normalizedDay, title: parsed.recipeTitle };
  } catch (err) {
    console.error('Add to meal plan error:', err);
    return { success: false, error: (err as Error).message };
  }
}

const SEASONAL_BY_MONTH: Record<number, { northern: string[]; balkan: string[] }> = {
  1: { northern: ['citrus', 'root vegetables', 'cabbage', 'kale'], balkan: ['sauerkraut', 'pickled vegetables', 'winter stews'] },
  2: { northern: ['citrus', 'leeks', 'parsnips'], balkan: ['preserved meats', 'dried beans'] },
  3: { northern: ['asparagus', 'spring greens', 'rhubarb'], balkan: ['early greens', 'wild herbs'] },
  4: { northern: ['asparagus', 'peas', 'radishes'], balkan: ['spring lamb', 'fresh herbs'] },
  5: { northern: ['strawberries', 'peas', 'spinach'], balkan: ['artichokes', 'fresh cheese'] },
  6: { northern: ['berries', 'zucchini', 'tomatoes'], balkan: ['tomatoes', 'peppers', 'eggplant'] },
  7: { northern: ['berries', 'corn', 'cucumbers'], balkan: ['peppers', 'tomatoes', 'zucchini'] },
  8: { northern: ['tomatoes', 'melons', 'beans'], balkan: ['peppers', 'eggplant', 'figs'] },
  9: { northern: ['apples', 'squash', 'grapes'], balkan: ['grapes', 'plums', 'walnuts'] },
  10: { northern: ['pumpkin', 'apples', 'root veg'], balkan: ['quince', 'chestnuts', 'cabbage'] },
  11: { northern: ['squash', 'brussels', 'pears'], balkan: ['cabbage', 'preserving season'] },
  12: { northern: ['citrus', 'winter squash', 'nuts'], balkan: ['festive meats', 'baklava ingredients'] },
};

export async function handleSeasonalTips({ region = 'balkan' }: { region?: string }) {
  const month = new Date().getMonth() + 1;
  const data = SEASONAL_BY_MONTH[month] || SEASONAL_BY_MONTH[1];
  const items = region.toLowerCase().includes('balkan') ? data.balkan : data.northern;
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return { success: true, month: monthNames[month], items, region: region.includes('balkan') ? 'Balkan' : 'Northern hemisphere' };
}

export async function handleFindByIngredients({ ingredients, userId }: { ingredients: string[]; userId?: string }) {
  if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
    return { success: false, error: 'List the ingredients you have.' };
  }
  const text = ingredients.join(', ');
  try {
    const { getSimilarRecipes } = await import('./stores/similarRecipesStore');
    const results = await getSimilarRecipes('chat-search', `Ingredients: ${text}`, 6);
    return {
      success: true,
      recipes: results.map((r: { id: string; recipeTitle: string }) => ({ id: r.id, title: r.recipeTitle, url: `https://www.babaselo.com/recipe/${r.id}` })),
    };
  } catch (err) {
    console.error('Find by ingredients error:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function handleUnitConversion({ amount, fromUnit, toUnit }: { amount: number; fromUnit: string; toUnit: string }) {
  const amt = parseFloat(String(amount));
  if (isNaN(amt) || amt <= 0) return { success: false, error: 'Invalid amount.' };
  const from = (fromUnit || '').toLowerCase().replace(/\s+/g, ' ');
  const to = (toUnit || '').toLowerCase().replace(/\s+/g, ' ');
  const key = `${from} to ${to}`;
  let result: string | null = null;
  if (key.includes('g') && key.includes('cups')) {
    if (from.includes('g') && to.includes('cup')) {
      if (key.includes('flour')) result = (amt / 120).toFixed(2) + ' cups';
      else if (key.includes('sugar')) result = (amt / 200).toFixed(2) + ' cups';
      else result = (amt / 125).toFixed(2) + ' cups (approx, for dry goods)';
    } else if (from.includes('cup') && to.includes('g')) {
      if (key.includes('flour')) result = Math.round(amt * 120) + ' g';
      else if (key.includes('sugar')) result = Math.round(amt * 200) + ' g';
      else result = Math.round(amt * 125) + ' g (approx)';
    }
  } else if (key.includes('ml') && key.includes('cup')) {
    if (from.includes('ml')) result = (amt / 240).toFixed(2) + ' cups';
    else result = Math.round(amt * 240) + ' ml';
  } else if (key.includes('tbsp') || key.includes('tablespoon')) {
    if (to.includes('ml')) result = Math.round(amt * 15) + ' ml';
    else if (to.includes('tsp')) result = (amt * 3).toFixed(1) + ' tsp';
  } else if (key.includes('tsp') || key.includes('teaspoon')) {
    if (to.includes('ml')) result = (amt * 5).toFixed(1) + ' ml';
    else if (to.includes('tbsp')) result = (amt / 3).toFixed(2) + ' tbsp';
  }
  if (result) return { success: true, result: `${amount} ${fromUnit} ≈ ${result}` };
  return { success: false, error: `I can convert g↔cups, ml↔cups, tbsp↔tsp. Try "200g flour to cups" or "1 cup to ml".` };
}
