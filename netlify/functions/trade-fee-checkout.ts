import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';

/** Instant-confirming Stripe Checkout methods for trade fees (no BNPL/ACH). */
const TRADE_CHECKOUT_PAYMENT_METHOD_TYPES = ['card', 'link', 'cashapp', 'amazon_pay'] as const;

/**
 * Stripe Checkout for bundled Get Vaulted trade fee (shipping + protection + support).
 * Persists `payments` + auto-labels via `stripe-webhook` on `checkout.session.completed`.
 *
 * Before opening Checkout, persist on the trade row:
 * `trade_offers.metadata.shippo_label.ship_from` as `{ [sender_uuid]: ShippoAddress, [recipient_uuid]: ShippoAddress }`
 * so the webhook can purchase both Shippo labels without client-side secrets.
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

  let body: { tradeOfferId?: string; amountCents?: number; userId?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const amount = body.amountCents ?? 1500;
  const tradeOfferId = body.tradeOfferId ?? 'unknown';

  const stripe = new Stripe(secret, { apiVersion: '2025-02-24.acacia' });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: [...TRADE_CHECKOUT_PAYMENT_METHOD_TYPES],
    success_url: `${site}/trade/fee/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/trade/fee/cancel`,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: {
            name: 'Get Vaulted — trade lane fee (placeholder)',
            description: 'Bundled label + tracking + trade protection (fee tiers by weight in app logic).',
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: 'trade_fee',
      trade_offer_id: tradeOfferId,
      payer_user_id: body.userId ?? '',
    },
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: session.id, url: session.url }),
  };
};
