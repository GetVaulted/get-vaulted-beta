import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { readShippoEnv } from './env';
import { ensureTradeFeeShippoLabels } from './trade-shippo-labels';

const TRADE_FEE_LABEL_STATUSES = ['fee_due', 'accepted', 'labels_pending', 'labels_generating', 'label_error'] as const;

type TradeRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: string;
  shipping_weight_tier: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Manual E2E checklist (Stripe test mode + Shippo test token):
 * 1) Create trade offer between two users; accept → status fee_due (or accepted).
 * 2) Set trade_offers.metadata.shippo_label.ship_from { [sender_id], [recipient_id] } with valid addresses.
 * 3) POST trade-fee-checkout with tradeOfferId + userId (payer must be a participant).
 * 4) Complete Checkout; Stripe sends checkout.session.completed to stripe-webhook.
 * 5) Webhook inserts payments row, sets trade labels_generating → Shippo → labels_generated (or label_error).
 * 6) Re-deliver same webhook event → idempotent: no duplicate labels (stripe_event_id + shipping_labels).
 */
export async function handleTradeFeeCheckoutSessionCompleted(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
  stripeEvent: Stripe.Event,
): Promise<void> {
  const meta = session.metadata ?? {};
  const tradeOfferId = meta.trade_offer_id?.trim();
  const payerUserId = (meta.payer_user_id || session.client_reference_id || '').trim();

  if (!tradeOfferId || !payerUserId) {
    console.warn('trade_fee checkout missing trade_offer_id or payer_user_id in metadata');
    return;
  }

  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    console.warn('trade_fee session not paid yet; skipping auto-labels', session.id, session.payment_status);
    return;
  }

  const { data: trade, error: tradeErr } = await admin
    .from('trade_offers')
    .select('id, sender_id, recipient_id, status, shipping_weight_tier, metadata')
    .eq('id', tradeOfferId)
    .maybeSingle();

  if (tradeErr || !trade) {
    console.error('trade_fee webhook: trade not found', tradeOfferId, tradeErr);
    return;
  }

  const t = trade as TradeRow;
  if (t.sender_id !== payerUserId && t.recipient_id !== payerUserId) {
    console.error('trade_fee webhook: payer is not a trade participant', payerUserId, tradeOfferId);
    return;
  }

  if (!TRADE_FEE_LABEL_STATUSES.includes(t.status as (typeof TRADE_FEE_LABEL_STATUSES)[number])) {
    console.warn('trade_fee webhook: trade status not eligible for auto-labels', t.status, tradeOfferId);
    await recordTradeFeePaymentOnly(admin, session, stripeEvent, payerUserId, tradeOfferId);
    return;
  }

  const shippoToken = readShippoEnv().shippoToken?.trim() || null;

  const { data: existingByEvent } = await admin
    .from('payments')
    .select('id, trade_offer_id, stripe_checkout_session_id')
    .eq('stripe_event_id', stripeEvent.id)
    .maybeSingle();

  if (existingByEvent) {
    if (existingByEvent.trade_offer_id != null && existingByEvent.trade_offer_id !== tradeOfferId) {
      console.error('stripe_event_id payment trade_offer_id mismatch', stripeEvent.id);
      return;
    }
    await linkFeePaymentAndGenerateLabels(admin, shippoToken, t, existingByEvent.id as string, tradeOfferId);
    return;
  }

  const { data: existingBySession } = await admin
    .from('payments')
    .select('id')
    .eq('stripe_checkout_session_id', session.id)
    .eq('kind', 'trade_fee')
    .maybeSingle();

  if (existingBySession) {
    await admin.from('payments').update({ stripe_event_id: stripeEvent.id }).eq('id', existingBySession.id);
    await linkFeePaymentAndGenerateLabels(admin, shippoToken, t, existingBySession.id as string, tradeOfferId);
    return;
  }

  const paymentInsert = {
    user_id: payerUserId,
    amount_cents: session.amount_total ?? 0,
    currency: session.currency ?? 'usd',
    kind: 'trade_fee' as const,
    status: 'succeeded' as const,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    stripe_event_id: stripeEvent.id,
    trade_offer_id: tradeOfferId,
    metadata: {
      source: 'stripe_webhook',
      stripe_event_id: stripeEvent.id,
      trade_offer_id: tradeOfferId,
    },
  };

  const { data: inserted, error: insErr } = await admin.from('payments').insert(paymentInsert).select('id').single();

  if (insErr) {
    if (insErr.code === '23505') {
      const { data: dup } = await admin.from('payments').select('id').eq('stripe_event_id', stripeEvent.id).maybeSingle();
      if (dup?.id) {
        await linkFeePaymentAndGenerateLabels(admin, shippoToken, t, dup.id as string, tradeOfferId);
        return;
      }
      const { data: dupTrade } = await admin
        .from('payments')
        .select('id')
        .eq('trade_offer_id', tradeOfferId)
        .eq('kind', 'trade_fee')
        .eq('status', 'succeeded')
        .maybeSingle();
      if (dupTrade?.id) {
        await linkFeePaymentAndGenerateLabels(admin, shippoToken, t, dupTrade.id as string, tradeOfferId);
        return;
      }
    }
    console.error('trade_fee payment insert failed', insErr);
    return;
  }

  if (!inserted?.id) {
    console.error('trade_fee payment insert returned no id');
    return;
  }

  await linkFeePaymentAndGenerateLabels(admin, shippoToken, t, inserted.id as string, tradeOfferId);
}

async function recordTradeFeePaymentOnly(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
  stripeEvent: Stripe.Event,
  payerUserId: string,
  tradeOfferId: string,
): Promise<void> {
  const { data: existing } = await admin.from('payments').select('id').eq('stripe_event_id', stripeEvent.id).maybeSingle();
  if (existing) return;

  const { error } = await admin.from('payments').insert({
    user_id: payerUserId,
    amount_cents: session.amount_total ?? 0,
    currency: session.currency ?? 'usd',
    kind: 'trade_fee',
    status: 'succeeded',
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    stripe_event_id: stripeEvent.id,
    trade_offer_id: tradeOfferId,
    metadata: { source: 'stripe_webhook', note: 'trade_status_ineligible_for_auto_labels' },
  });
  if (error && error.code !== '23505') {
    console.error('recordTradeFeePaymentOnly failed', error);
  }
}

async function linkFeePaymentAndGenerateLabels(
  admin: SupabaseClient,
  shippoToken: string | null,
  trade: TradeRow,
  paymentId: string,
  expectedTradeOfferId: string,
): Promise<void> {
  const { data: payRow } = await admin.from('payments').select('trade_offer_id').eq('id', paymentId).maybeSingle();
  if (payRow?.trade_offer_id != null && payRow.trade_offer_id !== expectedTradeOfferId) {
    console.error('fee payment row trade_offer_id mismatch', paymentId, payRow.trade_offer_id, expectedTradeOfferId);
    return;
  }
  if (payRow && payRow.trade_offer_id == null) {
    await admin.from('payments').update({ trade_offer_id: expectedTradeOfferId }).eq('id', paymentId);
  }

  await admin
    .from('trade_offers')
    .update({
      fee_payment_id: paymentId,
      status: 'labels_pending',
      label_error_message: null,
    })
    .eq('id', trade.id);

  await ensureTradeFeeShippoLabels(admin, shippoToken, trade);
}
