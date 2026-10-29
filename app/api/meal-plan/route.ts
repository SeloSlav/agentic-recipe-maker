import { NextResponse } from 'next/server';
import { serverDb, serverAuth } from "../../lib/backend/admin";
import { generateMealPlan } from '../../lib/meal-plan/mealPlanGenerator';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await serverAuth.verifyToken(idToken);
    const userId = decoded.uid;

    const userDoc = await serverDb.collection('users').doc(userId).get();
    const userData = userDoc.data();

    const body = await req.json().catch(() => ({}));
    const { mealPlanPrompt: bodyPrompt, dietaryPreferences = [], preferredCookingOil = 'olive oil', days = 1 } = body;

    const promptFromBody = (bodyPrompt || '').trim();
    const promptFromUser = (userData?.mealPlanPrompt || '').trim();
    const mealPlanPrompt = promptFromBody || promptFromUser;

    const prefs = Array.isArray(dietaryPreferences) ? dietaryPreferences : (userData?.dietaryPreferences as string[]) || [];
    const oil = String(preferredCookingOil || userData?.preferredCookingOil || 'olive oil');

    const mealPlan = await generateMealPlan({
      mealPlanPrompt,
      dietaryPreferences: prefs,
      preferredCookingOil: oil,
      days: Number(days) || 1,
    });

    return NextResponse.json({ mealPlan });
  } catch (error) {
    console.error('Meal plan error:', error);
    return NextResponse.json({ error: 'Failed to generate meal plan' }, { status: 500 });
  }
}
