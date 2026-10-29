import { NextResponse } from 'next/server';
import { serverDb, serverAuth } from "../../../lib/backend/admin";
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.MEAL_PLAN_FROM_EMAIL || 'Baba Selo <onboarding@resend.dev>';

/**
 * Resend a meal plan's ingredients/shopping list to the user's email.
 * POST body: { planId: string }
 */
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
    const email = decoded.email || userData?.email;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'No email address found' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const planId = body.planId;
    if (!planId || typeof planId !== 'string') {
      return NextResponse.json({ error: 'planId required' }, { status: 400 });
    }

    const planRef = serverDb.collection('users').doc(userId).collection('mealPlanHistory').doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const planData = planSnap.data();
    const rawShoppingList = planData?.shoppingList;
    const planType = planData?.type || 'weekly';

    let shoppingList: string;
    if (typeof rawShoppingList === 'string') {
      shoppingList = rawShoppingList;
    } else if (rawShoppingList && typeof rawShoppingList === 'object' && !Array.isArray(rawShoppingList)) {
      const lines: string[] = [];
      for (const [cat, val] of Object.entries(rawShoppingList)) {
        if (val == null) continue;
        const label = cat.charAt(0).toUpperCase() + cat.slice(1);
        if (typeof val === 'string') {
          if (val.trim()) lines.push(`${label}:\n${val.trim()}`);
        } else if (Array.isArray(val)) {
          const items = val.filter((v) => v != null && String(v).trim()).map((v) => `- ${String(v).trim()}`);
          if (items.length) lines.push(`${label}:\n${items.join('\n')}`);
        }
      }
      shoppingList = lines.join('\n\n');
    } else {
      return NextResponse.json({ error: 'This plan has no shopping list to resend' }, { status: 400 });
    }

    if (!shoppingList.trim()) {
      return NextResponse.json({ error: 'This plan has no shopping list to resend' }, { status: 400 });
    }

    if (!resend) {
      return NextResponse.json({ error: 'Email not configured' }, { status: 500 });
    }

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: "Baba Selo's Shopping List — Ingredients",
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Your shopping list from Baba Selo</h2>
          <p>Hello dear! Here are the ingredients for your ${planType} meal plan:</p>
          <pre style="white-space: pre-wrap; background: #f9f9f9; padding: 1rem; border-radius: 8px;">${shoppingList.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
          <p style="margin-top: 1.5rem; color: #666;">With love,<br/>Baba Selo</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json({ error: 'Email not sent' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Resend ingredients error:', error);
    return NextResponse.json({ error: 'Failed to resend' }, { status: 500 });
  }
}
