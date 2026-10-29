"use client";

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { auth } from "../lib/backend/client";

function CheckoutContent() {
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan') || 'monthly';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeCheckout = async () => {
      try {
        const user = auth?.currentUser;

        const response = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: plan === 'annual' ? 'annual' : 'monthly',
            successUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${window.location.origin}/upgrade`,
            userId: user?.uid,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Failed to create checkout session');
          setLoading(false);
          return;
        }

        if (data.url) {
          window.location.href = data.url;
          return;
        }
        if (data.id) {
          window.location.href = `https://checkout.stripe.com/c/pay/${data.id}`;
          return;
        }

        setError(data.error || 'Checkout unavailable');
      } catch (err) {
        setError('Failed to initialize checkout');
      } finally {
        setLoading(false);
      }
    };

    initializeCheckout();
  }, [plan]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-amber-50/50 to-white px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg shadow-amber-900/5 border border-amber-100 p-8 text-center">
        {loading ? (
          <div className="py-8 flex flex-col items-center">
            <LoadingSpinner className="mb-4" />
            <p className="text-gray-600">Preparing your checkout...</p>
          </div>
        ) : error ? (
          <div className="py-8">
            <div className="text-red-600 mb-4 text-5xl">⚠️</div>
            <p className="text-gray-800 font-medium mb-2">Checkout Unavailable</p>
            <p className="text-gray-600 mb-6">{error}</p>
            <a
              href="/upgrade"
              className="inline-block bg-amber-600 text-white px-6 py-2 rounded-xl hover:bg-amber-700 transition-colors"
            >
              Go Back
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading checkout...</div>}>
      <CheckoutContent />
    </Suspense>
  );
}
