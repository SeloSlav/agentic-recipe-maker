import { NextResponse } from 'next/server';
import { serverDb, serverAuth } from "../../../lib/backend/admin";
import { Resend } from 'resend';
import { generateMealPlanWithRecipes } from '../../../lib/meal-plan/mealPlanService';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.MEAL_PLAN_FROM_EMAIL || 'Baba Selo <onboarding@resend.dev>';
const CRON_SECRET = process.env.CRON_SECRET;

function getLocalTimeInTimezone(date: Date, timeZone: string): { hour: number; minute: number; dayOfWeek: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      hour: parseInt(get('hour'), 10),
      minute: parseInt(get('minute'), 10),
      dayOfWeek: Math.max(0, dayNames.indexOf(get('weekday'))),
    };
  } catch {
    return { hour: date.getUTCHours(), minute: date.getUTCMinutes(), dayOfWeek: date.getUTCDay() };
  }
}

export async function GET(req: Request) {
  if (CRON_SECRET && req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!resend) {
    return NextResponse.json({ message: 'Email not configured' });
  }

  try {
    const usersSnapshot = await serverDb.collection('users').get();
    const now = new Date();

    let sent = 0;
    for (const doc of usersSnapshot.docs) {
      const d = doc.data();

      const schedule = d.mealPlanSchedule;
      if (!schedule?.enabled || !schedule?.time) continue;

      const timeZone = schedule.timezone || 'UTC';
      const local = getLocalTimeInTimezone(now, timeZone);
      const nowStr = `${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}`;

      const planType = (d.mealPlanType || 'weekly') as 'weekly' | 'daily';
      if (planType === 'weekly') {
        const dayOfWeek = schedule.dayOfWeek ?? 6; // default Saturday
        if (local.dayOfWeek !== dayOfWeek) continue;
      }

      const [schedHour, schedMin] = String(schedule.time).split(':').map(Number);
      const scheduleStr = `${schedHour.toString().padStart(2, '0')}:${(schedMin || 0).toString().padStart(2, '0')}`;
      if (scheduleStr !== nowStr) continue;

      const email = d.email || (await serverAuth.getUser(doc.id).catch(() => null))?.email;
      if (!email) continue;

      try {
        const variety = (d.mealPlanVariety || 'varied') as 'varied' | 'same_every_day' | 'same_every_week' | 'leftovers' | 'meal_prep_sunday';
        const slots = Array.isArray(d.mealPlanSlots) && d.mealPlanSlots.length > 0
          ? d.mealPlanSlots.filter((s: string) => ['breakfast', 'lunch', 'dinner', 'snack'].includes(s))
          : undefined;
        const result = await generateMealPlanWithRecipes({
          userId: doc.id,
          mealPlanPrompt: (d.mealPlanPrompt || '').trim(),
          ingredientsOnHand: (d.ingredientsOnHand || '').trim(),
          calorieTarget: d.mealPlanCalorieTarget,
          dietaryPreferences: d.dietaryPreferences || [],
          preferredCookingOil: d.preferredCookingOil || 'olive oil',
          type: planType,
          includeShoppingList: d.includeShoppingList ?? true,
          variety,
          slots: slots as ('breakfast' | 'lunch' | 'dinner' | 'snack')[] | undefined,
          reuseLastWeek: variety === 'same_every_week',
        });

        const isWeekly = planType === 'weekly';
        const { error } = await resend.emails.send({
          from: FROM_EMAIL,
          to: [email],
          subject: isWeekly ? "Baba Selo's Weekly Meal Plan" : "Baba Selo's Daily Meal Plan",
          html: `
            <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
              <h2>${isWeekly ? 'Your Weekly Meal Plan' : 'Your Daily Meal Plan'} from Baba Selo</h2>
              <p>Hello dear! Here's what I've planned for you${isWeekly ? ' this week' : ' today'}:</p>
              <pre style="white-space: pre-wrap; background: #f9f9f9; padding: 1rem; border-radius: 8px;">${result.plainContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
              <p style="margin-top: 1.5rem; color: #666;">With love, Baba Selo</p>
            </div>
          `,
        });
        if (error) console.error('Resend error for', email, error);
      } catch (e) {
        console.error('Failed to generate/send meal plan for', doc.id, e);
        continue;
      }

      sent++;
    }

    return NextResponse.json({ sent });
  } catch (error) {
    console.error('Cron meal plans error:', error);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
