import type { Handler } from '@netlify/functions';
import { readSupabaseEnv, requireShippoToken, requireSupabaseService } from './_lib/env';
import {
  shippoCreateAddress,
  shippoCreateShipment,
  shippoPurchaseLabel,
  type ShippoAddressInput,
  type ShippoParcelInput,
} from './_lib/shippo';
import { normalizeWeightTier, purchaseTradeShippingLabelIfNeeded } from './_lib/trade-shippo-labels';
import { createSupabaseService, getUserFromAuthHeader } from './_lib/supabase';

/**
 * Create a Shippo label for a trade or marketplace order.
 * MVP: purchases first returned rate — TODO: carrier account + service level selection.
 *
 * Body JSON:
 * - trade_id XOR order_id
 * - sender_user_id, recipient_user_id (must match trade participants or order seller/buyer)
 * - weight_tier (optional metadata)
 * - parcel: ShippoParcelInput
 * - insured_value (number)
 * - from_address, to_address: ShippoAddressInput
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sbEnv = readSupabaseEnv();
  const auth = await getUserFromAuthHeader(sbEnv.url, sbEnv.anonKey, event.headers.authorization);
  if ('error' in auth) {
    return { statusCode: auth.status, body: auth.error };
  }

  const svc = requireSupabaseService();
  if ('error' in svc) {
    return { statusCode: 500, body: svc.error };
  }

  const token = requireShippoToken();
  if (typeof token === 'object') {
    return { statusCode: 503, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: token.error }) };
  }

  let body: {
    trade_id?: string;
    order_id?: string;
    sender_user_id: string;
    recipient_user_id: string;
    weight_tier?: string;
    parcel: ShippoParcelInput;
    insured_value?: number;
    from_address: ShippoAddressInput;
    to_address: ShippoAddressInput;
  };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  if ((!body.trade_id && !body.order_id) || (body.trade_id && body.order_id)) {
    return { statusCode: 400, body: 'Provide exactly one of trade_id or order_id' };
  }
  if (!body.sender_user_id || !body.recipient_user_id || !body.parcel || !body.from_address || !body.to_address) {
    return { statusCode: 400, body: 'Missing sender_user_id, recipient_user_id, parcel, from_address, or to_address' };
  }
  if (auth.user.id !== body.sender_user_id && auth.user.id !== body.recipient_user_id) {
    return { statusCode: 403, body: 'Caller must be sender or recipient for this label' };
  }

  const admin = createSupabaseService(svc.url, svc.serviceKey);

  if (body.trade_id) {
    const { data: trade, error: te } = await admin
      .from('trade_offers')
      .select('id, sender_id, recipient_id, status')
      .eq('id', body.trade_id)
      .single();
    if (te || !trade) {
      return { statusCode: 404, body: 'Trade not found' };
    }
    if (!['accepted', 'fee_due', 'labels_pending', 'labels_generating', 'label_error', 'labels_generated'].includes(trade.status as string)) {
      return { statusCode: 400, body: 'Trade is not in a label-eligible status' };
    }
    if (trade.sender_id !== body.sender_user_id || trade.recipient_id !== body.recipient_user_id) {
      return { statusCode: 400, body: 'sender_user_id / recipient_user_id must match trade parties' };
    }
    if (auth.user.id !== body.sender_user_id) {
      return { statusCode: 403, body: 'Caller must be sender_user_id (shipper for this label)' };
    }

    const tradeResult = await purchaseTradeShippingLabelIfNeeded(admin, token, {
      tradeId: body.trade_id,
      shipperUserId: body.sender_user_id,
      recipientUserId: body.recipient_user_id,
      fromAddress: body.from_address,
      toAddress: body.to_address,
      parcel: body.parcel,
      insuredValue: body.insured_value ?? 0,
      weightTier: normalizeWeightTier(body.weight_tier),
    });

    if (!tradeResult.ok) {
      return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: tradeResult.error }) };
    }

    const { data: labelRow } = await admin
      .from('shipping_labels')
      .select('id, shippo_transaction_id, label_url, tracking_number, tracking_url')
      .eq('id', tradeResult.labelId)
      .maybeSingle();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label_id: tradeResult.labelId,
        skipped: tradeResult.skipped,
        shippo_transaction_id: labelRow?.shippo_transaction_id,
        label_url: labelRow?.label_url,
        tracking_number: labelRow?.tracking_number,
        tracking_url: labelRow?.tracking_url,
      }),
    };
  }

  if (body.order_id) {
    const { data: order, error: oe } = await admin
      .from('orders')
      .select('id, buyer_id, seller_id, status')
      .eq('id', body.order_id)
      .single();
    if (oe || !order) {
      return { statusCode: 404, body: 'Order not found' };
    }
    if (order.status !== 'paid') {
      return { statusCode: 400, body: 'Order must be paid before label purchase' };
    }
    if (
      !(
        (order.seller_id === body.sender_user_id && order.buyer_id === body.recipient_user_id) ||
        (order.seller_id === body.recipient_user_id && order.buyer_id === body.sender_user_id)
      )
    ) {
      return { statusCode: 400, body: 'sender/recipient must match order buyer and seller' };
    }
    if (auth.user.id !== order.buyer_id && auth.user.id !== order.seller_id) {
      return { statusCode: 403, body: 'Caller must be buyer or seller' };
    }
  }

  let fromId: string;
  let toId: string;
  try {
    const from = await shippoCreateAddress(token, body.from_address);
    const to = await shippoCreateAddress(token, body.to_address);
    fromId = from.object_id;
    toId = to.object_id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Shippo address error';
    return { statusCode: 502, body: JSON.stringify({ error: msg }) };
  }

  const parcels = [
    {
      ...body.parcel,
      metadata: 'Get Vaulted',
    },
  ];

  let shipment: Awaited<ReturnType<typeof shippoCreateShipment>>;
  try {
    shipment = await shippoCreateShipment(token, {
      address_from: fromId,
      address_to: toId,
      parcels,
      async: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Shippo shipment error';
    return { statusCode: 502, body: JSON.stringify({ error: msg }) };
  }

  const rate = shipment.rates?.[0];
  if (!rate?.object_id) {
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: 'No Shippo rates returned — TODO: connect carrier accounts / service levels.',
        shipment_id: shipment.object_id,
      }),
    };
  }

  let tx: Awaited<ReturnType<typeof shippoPurchaseLabel>>;
  try {
    tx = await shippoPurchaseLabel(token, rate.object_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Shippo transaction error';
    return { statusCode: 502, body: JSON.stringify({ error: msg }) };
  }

  const labelUserId = auth.user.id;
  const insured = body.insured_value ?? 0;
  const weightTier = normalizeWeightTier(body.weight_tier);

  const { data: inserted, error: insErr } = await admin
    .from('shipping_labels')
    .insert({
      trade_id: body.trade_id ?? null,
      order_id: body.order_id ?? null,
      user_id: labelUserId,
      sender_user_id: body.sender_user_id,
      recipient_user_id: body.recipient_user_id,
      weight_tier: weightTier,
      package_dimensions: body.parcel as unknown as Record<string, unknown>,
      insured_value: insured,
      shippo_shipment_id: shipment.object_id,
      shippo_transaction_id: tx.object_id,
      carrier: tx.rate?.provider ?? rate.provider,
      service_level: tx.rate?.servicelevel?.name ?? rate.servicelevel?.name,
      label_url: tx.label_url ?? null,
      tracking_number: tx.tracking_number ?? null,
      tracking_url: tx.tracking_url_provider ?? null,
      estimated_delivery: tx.eta ? new Date(tx.eta).toISOString() : null,
      cost: tx.rate?.amount ? Number(tx.rate.amount) : Number(rate.amount),
      status: String(tx.status).toUpperCase() === 'SUCCESS' ? 'purchased' : 'pending',
      provider: 'shippo',
    })
    .select('id')
    .single();

  if (insErr) {
    return { statusCode: 500, body: JSON.stringify({ error: insErr.message, shippo: tx }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label_id: inserted?.id,
      shippo_transaction_id: tx.object_id,
      label_url: tx.label_url,
      tracking_number: tx.tracking_number,
      tracking_url: tx.tracking_url_provider,
    }),
  };
};
