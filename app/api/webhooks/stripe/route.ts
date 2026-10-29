import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { serverDb, serverAuth } from "../../../lib/backend/admin";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || session.metadata?.userId;
      if (userId) {
        await serverDb.collection('users').doc(userId).set(
          { plan: 'pro', stripeCustomerId: session.customer },
          { merge: true }
        );
      }
    } else if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription;
      if (event.type === 'customer.subscription.deleted' || sub.status !== 'active') {
        const customers = await serverDb.collection('users')
          .where('stripeCustomerId', '==', sub.customer)
          .limit(1)
          .get();
        for (const d of customers.docs) {
          await d.ref.update({ plan: 'free' });
        }
      } else if (sub.status === 'active') {
        const customers = await serverDb.collection('users')
          .where('stripeCustomerId', '==', sub.customer)
          .limit(1)
          .get();
        for (const d of customers.docs) {
          await d.ref.update({ plan: 'pro' });
        }
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
