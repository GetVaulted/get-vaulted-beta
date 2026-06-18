import type { SupabaseClient } from '@supabase/supabase-js';
import {
  shippoCreateAddress,
  shippoCreateShipment,
  shippoPurchaseLabel,
  type ShippoAddressInput,
  type ShippoParcelInput,
} from './shippo';

const WEIGHT_TIERS = new Set([
  'cards_slabs',
  'sneakers',
  'memorabilia',
  'watches_luxury',
  'oversized_custom',
]);

export function normalizeWeightTier(tier: string | null | undefined): string | null {
  if (!tier || !WEIGHT_TIERS.has(tier)) return null;
  return tier;
}

/** Map trade Supabase weight tiers to unified platform profile slugs. */
export const TRADE_WEIGHT_TIER_TO_PROFILE_SLUG: Record<string, string> = {
  cards_slabs: "graded_card",
  sneakers: "sneakers",
  memorabilia: "funko_collectible",
  watches_luxury: "watch",
  oversized_custom: "full_size_helmet",
};

/** Unified profile parcel defaults (oz + inches) — aligned with PlatformShippingProfile seeds. */
const UNIFIED_PROFILE_PARCELS: Record<
  string,
  { length: string; width: string; height: string; weightOz: number }
> = {
  trading_cards: { length: "8", width: "6", height: "1", weightOz: 4 },
  graded_card: { length: "10", width: "8", height: "2", weightOz: 8 },
  card_lot: { length: "10", width: "8", height: "3", weightOz: 12 },
  jersey: { length: "14", width: "11", height: "3", weightOz: 16 },
  mini_helmet: { length: "10", width: "8", height: "8", weightOz: 24 },
  full_size_helmet: { length: "16", width: "14", height: "12", weightOz: 80 },
  speedflex_helmet: { length: "16", width: "14", height: "14", weightOz: 96 },
  sneakers: { length: "14", width: "10", height: "6", weightOz: 48 },
  watch: { length: "6", width: "4", height: "3", weightOz: 8 },
  funko_collectible: { length: "10", width: "8", height: "6", weightOz: 16 },
  custom: { length: "12", width: "9", height: "4", weightOz: 16 },
};

function ozToShippoMass(weightOz: number): { weight: string; mass_unit: "oz" | "lb" } {
  if (weightOz >= 16) {
    return { weight: String(Math.max(1, Math.round((weightOz / 16) * 10) / 10)), mass_unit: "lb" };
  }
  return { weight: String(Math.max(1, weightOz)), mass_unit: "oz" };
}

/** Default parcel by trade lane tier — uses unified platform profile dimensions when mapped. */
export function defaultParcelForTier(tier: string | null | undefined): ShippoParcelInput {
  const slug = tier ? TRADE_WEIGHT_TIER_TO_PROFILE_SLUG[tier] : null;
  const unified = slug ? UNIFIED_PROFILE_PARCELS[slug] : null;
  if (unified) {
    const mass = ozToShippoMass(unified.weightOz);
    return {
      length: unified.length,
      width: unified.width,
      height: unified.height,
      distance_unit: "in",
      weight: mass.weight,
      mass_unit: mass.mass_unit,
    };
  }
  switch (tier) {
    case 'sneakers':
      return { length: '14', width: '10', height: '6', distance_unit: 'in', weight: '3', mass_unit: 'lb' };
    case 'memorabilia':
      return { length: '16', width: '12', height: '8', distance_unit: 'in', weight: '5', mass_unit: 'lb' };
    case 'watches_luxury':
      return { length: '10', width: '8', height: '4', distance_unit: 'in', weight: '2', mass_unit: 'lb' };
    case 'oversized_custom':
      return { length: '24', width: '18', height: '12', distance_unit: 'in', weight: '15', mass_unit: 'lb' };
    case 'cards_slabs':
    default:
      return { length: '8', width: '6', height: '2', distance_unit: 'in', weight: '1', mass_unit: 'lb' };
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function asAddress(obj: unknown): ShippoAddressInput | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (
    !isNonEmptyString(o.name) ||
    !isNonEmptyString(o.street1) ||
    !isNonEmptyString(o.city) ||
    !isNonEmptyString(o.state) ||
    !isNonEmptyString(o.zip) ||
    !isNonEmptyString(o.country)
  ) {
    return null;
  }
  return {
    name: o.name,
    street1: o.street1,
    street2: isNonEmptyString(o.street2) ? o.street2 : undefined,
    city: o.city,
    state: o.state,
    zip: o.zip,
    country: o.country,
    phone: isNonEmptyString(o.phone) ? o.phone : undefined,
  };
}

export type TradeShipFromResult =
  | { ok: true; senderFrom: ShippoAddressInput; recipientFrom: ShippoAddressInput }
  | { ok: false; error: string };

/**
 * Expects `trade_offers.metadata.shippo_label.ship_from` as a map of profile id → Shippo address object.
 * Collect both parties' return addresses before trade fee checkout (MVP contract).
 */
export function parseTradeShipFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  senderId: string,
  recipientId: string,
): TradeShipFromResult {
  const root = metadata ?? {};
  const shippoLabel = root.shippo_label as Record<string, unknown> | undefined;
  const shipFrom = shippoLabel?.ship_from as Record<string, unknown> | undefined;
  if (!shipFrom) {
    return {
      ok: false,
      error:
        'Missing trade_offers.metadata.shippo_label.ship_from — add both user ids with full Shippo-style addresses before opening trade fee checkout.',
    };
  }
  const senderFrom = asAddress(shipFrom[senderId]);
  const recipientFrom = asAddress(shipFrom[recipientId]);
  if (!senderFrom || !recipientFrom) {
    return {
      ok: false,
      error: 'ship_from map must include valid addresses for both sender_id and recipient_id.',
    };
  }
  return { ok: true, senderFrom, recipientFrom };
}

export function parcelForShipper(
  metadata: Record<string, unknown> | null | undefined,
  shipperUserId: string,
  tierFallback: string | null | undefined,
): ShippoParcelInput {
  const root = metadata ?? {};
  const shippoLabel = root.shippo_label as Record<string, unknown> | undefined;
  const parcels = shippoLabel?.parcels as Record<string, unknown> | undefined;
  const custom = parcels?.[shipperUserId];
  const parsed = custom && typeof custom === 'object' ? (custom as ShippoParcelInput) : null;
  if (
    parsed &&
    isNonEmptyString(parsed.length) &&
    isNonEmptyString(parsed.width) &&
    isNonEmptyString(parsed.height) &&
    isNonEmptyString(parsed.weight) &&
    (parsed.distance_unit === 'in' || parsed.distance_unit === 'cm') &&
    (parsed.mass_unit === 'lb' || parsed.mass_unit === 'kg' || parsed.mass_unit === 'oz' || parsed.mass_unit === 'g')
  ) {
    return parsed;
  }
  return defaultParcelForTier(tierFallback);
}

export function insuredValueFromMetadata(metadata: Record<string, unknown> | null | undefined): number {
  const root = metadata ?? {};
  const shippoLabel = root.shippo_label as Record<string, unknown> | undefined;
  const v = shippoLabel?.insured_value_cents ?? root.insured_value_cents;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v / 100;
  return 0;
}

export type PurchaseTradeLabelParams = {
  tradeId: string;
  /** Label row owner = shipper for this direction */
  shipperUserId: string;
  recipientUserId: string;
  fromAddress: ShippoAddressInput;
  toAddress: ShippoAddressInput;
  parcel: ShippoParcelInput;
  insuredValue: number;
  weightTier: string | null;
};

/**
 * Idempotent: skips if this trade already has a purchased Shippo label for `shipperUserId`.
 * Returns whether a new row was created this call.
 */
export async function purchaseTradeShippingLabelIfNeeded(
  admin: SupabaseClient,
  shippoToken: string,
  p: PurchaseTradeLabelParams,
): Promise<{ ok: true; skipped: boolean; labelId: string } | { ok: false; error: string }> {
  const { data: existing } = await admin
    .from('shipping_labels')
    .select('id, shippo_transaction_id')
    .eq('trade_id', p.tradeId)
    .eq('user_id', p.shipperUserId)
    .maybeSingle();

  if (existing?.shippo_transaction_id) {
    return { ok: true, skipped: true, labelId: existing.id as string };
  }

  let fromId: string;
  let toId: string;
  try {
    const from = await shippoCreateAddress(shippoToken, p.fromAddress);
    const to = await shippoCreateAddress(shippoToken, p.toAddress);
    fromId = from.object_id;
    toId = to.object_id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Shippo address error';
    return { ok: false, error: msg };
  }

  const parcels = [{ ...p.parcel, metadata: 'Get Vaulted' }];

  let shipment: Awaited<ReturnType<typeof shippoCreateShipment>>;
  try {
    shipment = await shippoCreateShipment(shippoToken, {
      address_from: fromId,
      address_to: toId,
      parcels,
      async: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Shippo shipment error';
    return { ok: false, error: msg };
  }

  const rate = shipment.rates?.[0];
  if (!rate?.object_id) {
    return {
      ok: false,
      error: 'No Shippo rates returned — connect carrier accounts / service levels (TODO).',
    };
  }

  let tx: Awaited<ReturnType<typeof shippoPurchaseLabel>>;
  try {
    tx = await shippoPurchaseLabel(shippoToken, rate.object_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Shippo transaction error';
    return { ok: false, error: msg };
  }

  const success = String(tx.status).toUpperCase() === 'SUCCESS';
  if (!success) {
    return { ok: false, error: `Shippo transaction status: ${tx.status}` };
  }

  const { data: inserted, error: insErr } = await admin
    .from('shipping_labels')
    .insert({
      trade_id: p.tradeId,
      order_id: null,
      user_id: p.shipperUserId,
      sender_user_id: p.shipperUserId,
      recipient_user_id: p.recipientUserId,
      weight_tier: p.weightTier as
        | 'cards_slabs'
        | 'sneakers'
        | 'memorabilia'
        | 'watches_luxury'
        | 'oversized_custom'
        | null,
      package_dimensions: p.parcel as unknown as Record<string, unknown>,
      insured_value: p.insuredValue,
      shippo_shipment_id: shipment.object_id,
      shippo_transaction_id: tx.object_id,
      carrier: tx.rate?.provider ?? rate.provider,
      service_level: tx.rate?.servicelevel?.name ?? rate.servicelevel?.name,
      label_url: tx.label_url ?? null,
      tracking_number: tx.tracking_number ?? null,
      tracking_url: tx.tracking_url_provider ?? null,
      estimated_delivery: tx.eta ? new Date(tx.eta).toISOString() : null,
      cost: tx.rate?.amount ? Number(tx.rate.amount) : Number(rate.amount),
      status: 'purchased',
      provider: 'shippo',
      shippo_error_message: null,
    })
    .select('id')
    .single();

  if (insErr || !inserted?.id) {
    return { ok: false, error: insErr?.message ?? 'Insert failed' };
  }

  await updateTradeStatusIfBothLabelsPresent(admin, p.tradeId);
  return { ok: true, skipped: false, labelId: inserted.id as string };
}

export async function updateTradeStatusIfBothLabelsPresent(admin: SupabaseClient, tradeId: string): Promise<void> {
  const { data: parties } = await admin
    .from('shipping_labels')
    .select('user_id')
    .eq('trade_id', tradeId)
    .not('shippo_transaction_id', 'is', null);
  const distinct = new Set((parties ?? []).map((row: { user_id: string }) => row.user_id));
  if (distinct.size >= 2) {
    await admin
      .from('trade_offers')
      .update({ status: 'labels_generated', label_error_message: null })
      .eq('id', tradeId);
  }
}

type TradeForLabels = {
  id: string;
  sender_id: string;
  recipient_id: string;
  shipping_weight_tier: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Webhook path: purchase both directions (idempotent). Sets trade `label_error` on missing Shippo token,
 * bad metadata, or Shippo failures. Sets `labels_generated` when both labels exist (via purchase helper).
 */
export async function ensureTradeFeeShippoLabels(
  admin: SupabaseClient,
  shippoToken: string | null,
  trade: TradeForLabels,
): Promise<void> {
  const meta = (trade.metadata ?? {}) as Record<string, unknown>;

  if (!shippoToken) {
    await admin
      .from('trade_offers')
      .update({
        status: 'label_error',
        label_error_message:
          'Missing SHIPPO_API_TOKEN on Netlify — cannot purchase labels (configure for production).',
      })
      .eq('id', trade.id);
    return;
  }

  const addrs = parseTradeShipFromMetadata(meta, trade.sender_id, trade.recipient_id);
  if (!addrs.ok) {
    await admin
      .from('trade_offers')
      .update({
        status: 'label_error',
        label_error_message: addrs.error,
      })
      .eq('id', trade.id);
    return;
  }

  await admin.from('trade_offers').update({ status: 'labels_generating' }).eq('id', trade.id);

  const tier = normalizeWeightTier(trade.shipping_weight_tier);
  const insured = insuredValueFromMetadata(meta);
  const parcelSender = parcelForShipper(meta, trade.sender_id, tier);
  const parcelRecipient = parcelForShipper(meta, trade.recipient_id, tier);

  const r1 = await purchaseTradeShippingLabelIfNeeded(admin, shippoToken, {
    tradeId: trade.id,
    shipperUserId: trade.sender_id,
    recipientUserId: trade.recipient_id,
    fromAddress: addrs.senderFrom,
    toAddress: addrs.recipientFrom,
    parcel: parcelSender,
    insuredValue: insured,
    weightTier: tier,
  });

  const r2 = await purchaseTradeShippingLabelIfNeeded(admin, shippoToken, {
    tradeId: trade.id,
    shipperUserId: trade.recipient_id,
    recipientUserId: trade.sender_id,
    fromAddress: addrs.recipientFrom,
    toAddress: addrs.senderFrom,
    parcel: parcelRecipient,
    insuredValue: insured,
    weightTier: tier,
  });

  const errs: string[] = [];
  if (!r1.ok) errs.push(`Sender→recipient: ${r1.error}`);
  if (!r2.ok) errs.push(`Recipient→sender: ${r2.error}`);

  if (errs.length > 0) {
    await admin
      .from('trade_offers')
      .update({
        status: 'label_error',
        label_error_message: errs.join(' | '),
      })
      .eq('id', trade.id);
    return;
  }

  await updateTradeStatusIfBothLabelsPresent(admin, trade.id);
}
