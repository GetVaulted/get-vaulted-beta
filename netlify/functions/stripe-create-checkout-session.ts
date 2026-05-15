import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';

/**
 * Placeholder: create a Stripe Checkout Session for marketplace purchases.
 * Call from a secure context with authenticated user id; pass line items or price IDs from your admin.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return { statusCode: 500, body: 'Missing STRIPE_SECRET_KEY' };
  }

  const site = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://shopgetvaulted.app';

  let body: { amountCents?: number; currency?: string; userId?: string; metadata?: Record<string, string> };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const amount = body.amountCents ?? 1000;
  const currency = (body.currency ?? 'usd').toLowerCase();

  const stripe = new Stripe(secret, { apiVersion: '2025-02-24.acacia' });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: body.userId,
    success_url: `${site}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/checkout/cancel`,
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amount,
          product_data: { name: 'Get Vaulted — marketplace (placeholder)' },
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: 'marketplace_checkout',
      payer_user_id: body.userId ?? '',
      ...(body.metadata ?? {}),
    },
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: session.id, url: session.url }),
  };
};
