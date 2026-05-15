import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { requireSupabaseService } from './_lib/env';
import { handleTradeFeeCheckoutSessionCompleted } from './_lib/stripe-trade-fee';

/**
 * Stripe webhook — verify signature, sync payment state, and auto-generate Shippo labels for trade fees.
 *
 * Test path (Stripe test mode + Shippo test + Supabase):
 * - Create trade → accept → fee_due; set metadata.shippo_label.ship_from for both user ids.
 * - trade-fee-checkout → pay → checkout.session.completed fires.
 * - Confirm payments row, trade fee_payment_id, shipping_labels x2, trade_offers.status = labels_generated.
 * - Re-send same Stripe event → no duplicate payments/labels (stripe_event_id + label idempotency).
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const svc = requireSupabaseService();
  if ('error' in svc) {
    return { statusCode: 500, body: svc.error };
  }

  if (!secret || !whSecret) {
    return { statusCode: 500, body: 'Missing Stripe env' };
  }

  const stripe = new Stripe(secret, { apiVersion: '2025-02-24.acacia' });
  const sig = event.headers['stripe-signature'];
  if (!sig || !event.body) {
    return { statusCode: 400, body: 'Missing signature or body' };
  }

  let stripeEvent: Stripe.Event;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    stripeEvent = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'verify failed';
    return { statusCode: 400, body: `Webhook Error: ${msg}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    const admin = createClient(svc.url, svc.serviceKey);
    const meta = session.metadata ?? {};
    const kind = meta.kind === 'trade_fee' ? 'trade_fee' : 'marketplace_checkout';

    if (kind === 'trade_fee' && meta.trade_offer_id) {
      await handleTradeFeeCheckoutSessionCompleted(admin, session, stripeEvent);
      return { statusCode: 200, body: JSON.stringify({ received: true }) };
    }

    const userId = meta.payer_user_id || session.client_reference_id;
    if (userId) {
      const { error } = await admin.from('payments').insert({
        user_id: userId,
        amount_cents: session.amount_total ?? 0,
        currency: session.currency ?? 'usd',
        kind,
        status: 'succeeded',
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        stripe_event_id: stripeEvent.id,
        trade_offer_id: null,
        metadata: { stripe_event_id: stripeEvent.id },
      });
      if (error?.code === '23505') {
        // Duplicate webhook delivery (stripe_event_id unique).
      } else if (error) {
        console.error('Supabase payment insert failed', error);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
