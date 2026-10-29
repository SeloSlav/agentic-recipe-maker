import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { serverDb, serverAuth } from "../../lib/backend/admin";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY || '';
const PRICE_ANNUAL = process.env.STRIPE_PRICE_ANNUAL || '';

export async function POST(request: Request) {
  try {
    if (!stripe || !PRICE_MONTHLY) {
      return NextResponse.json({
        error: 'Stripe not configured',
        id: null,
      }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const { priceId, plan: planParam, successUrl, cancelUrl, userId } = body;

    const plan = planParam === 'annual' ? 'annual' : 'monthly';
    const price = priceId || (plan === 'annual' ? PRICE_ANNUAL : PRICE_MONTHLY);

    if (!price) {
      return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
    }

    const origin = request.headers.get('origin') || request.url.split('/').slice(0, 3).join('/');
    const success = successUrl || `${origin}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancel = cancelUrl || `${origin}/upgrade`;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [{ price, quantity: 1 }],
      mode: 'subscription',
      success_url: success,
      cancel_url: cancel,
      allow_promotion_codes: true,
    };

    if (userId) {
      sessionParams.client_reference_id = userId;
      sessionParams.metadata = { userId };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
