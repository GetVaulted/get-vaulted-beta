import {
  createListingViaWeb,
  fetchListingsByIdsFromWeb,
  fetchMyListingsFromWeb,
  fetchPublishedListingsFromWeb,
  getListingsAccessToken,
} from './webListingsRepository';
import {
  acceptTradeOfferViaWeb,
  counterTradeOfferViaWeb,
  createTradeOfferViaWeb,
  declineTradeOfferViaWeb,
  fetchTradeOfferDetailViaWeb,
  fetchTradeOffersForUserViaWeb,
  isWebTradeApiConfigured,
} from './tradeOffersWebApi';
import { getSupabase } from '../lib/supabase';
import { devPlaceholderShipFrom, shouldAttachDevShipFrom } from '../lib/devShippoPlaceholders';
import { tradeFeeUsdForTier } from '../lib/tradeFeeAmounts';
import type {
  ListingLite,
  ProfileLite,
  ShippingLabelVM,
  TradeOfferStatus,
  TradeOfferVM,
  ShippingWeightTier,
} from '../types/tradeOffers';

type TradeRow = {
  id: string;
  status: TradeOfferStatus;
  sender_id: string;
  recipient_id: string;
  requested_item_id: string;
  offered_item_ids: string[];
  cash_difference: number | string;
  message: string | null;
  trade_fee: number | string;
  shipping_weight_tier: ShippingWeightTier | null;
  label_error_message: string | null;
  metadata?: Record<string, unknown> | null;
  updated_at: string;
};

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function listingLiteFromWebListing(l: {
  id: string;
  title: string;
  price: number;
  imageUrls?: string[];
  condition: string;
}): ListingLite {
  return {
    id: l.id,
    title: l.title ?? 'Item',
    price: l.price,
    currency: 'usd',
    media_urls: l.imageUrls?.[0] ?? '',
    condition: l.condition ?? null,
    authentication_status: 'unknown',
  };
}

async function fetchListingsMap(_sb: NonNullable<ReturnType<typeof getSupabase>>, ids: string[]) {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return new Map<string, ListingLite>();
  const rows = await fetchListingsByIdsFromWeb(uniq);
  const m = new Map<string, ListingLite>();
  for (const row of rows) {
    m.set(row.id, listingLiteFromWebListing(row));
  }
  return m;
}

async function fetchProfilesMap(sb: NonNullable<ReturnType<typeof getSupabase>>, ids: string[]) {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return new Map<string, ProfileLite>();
  const { data, error } = await sb.from('profiles').select('id, username, display_name, avatar_url').in('id', uniq);
  if (error || !data) return new Map();
  const m = new Map<string, ProfileLite>();
  for (const row of data) {
    const p = row as ProfileLite;
    m.set(p.id, p);
  }
  return m;
}

function profileFallback(id: string, profiles: Map<string, ProfileLite>): ProfileLite {
  return (
    profiles.get(id) ?? {
      id,
      username: null,
      display_name: 'Collector',
      avatar_url: null,
    }
  );
}

function listingFallback(id: string, listings: Map<string, ListingLite>): ListingLite {
  return (
    listings.get(id) ?? {
      id,
      title: 'Trade item',
      price: 0,
      currency: 'usd',
      media_urls: '',
      condition: null,
      authentication_status: 'unknown',
    }
  );
}

function buildVm(
  row: TradeRow,
  listings: Map<string, ListingLite>,
  profiles: Map<string, ProfileLite>,
): TradeOfferVM | null {
  const sender = profileFallback(row.sender_id, profiles);
  const recipient = profileFallback(row.recipient_id, profiles);
  const requested = listingFallback(row.requested_item_id, listings);
  const offered = (row.offered_item_ids ?? [])
    .map((id) => listingFallback(id, listings))
    .filter((item) => Boolean(item.id));
  if (offered.length === 0) return null;
  return {
    id: row.id,
    status: row.status,
    sender_id: row.sender_id,
    recipient_id: row.recipient_id,
    requested_item_id: row.requested_item_id,
    offered_item_ids: row.offered_item_ids ?? [],
    cash_difference: num(row.cash_difference),
    message: row.message,
    trade_fee: num(row.trade_fee),
    shipping_weight_tier: row.shipping_weight_tier,
    label_error_message: row.label_error_message,
    updated_at: row.updated_at,
    sender,
    recipient,
    requested,
    offered,
  };
}

export async function fetchCompletedTradesForUser(userId: string): Promise<TradeOfferVM[]> {
  const feed = await fetchTradeOffersForUser(userId);
  return feed.offers.filter((t) => t.status === 'completed');
}

export type TradeOffersFeed = {
  offers: TradeOfferVM[];
  /** Prisma user id for inbox partitioning (may differ from Supabase auth id). */
  participantUserId: string;
  loadError: string | null;
};

export async function fetchTradeOffersForUser(userId: string): Promise<TradeOffersFeed> {
  let participantUserId = userId;
  let loadError: string | null = null;
  const webRows = isWebTradeApiConfigured()
    ? await fetchTradeOffersForUserViaWeb(userId).catch((e) => {
        loadError = e instanceof Error ? e.message : 'Could not load trade offers from the Vaulted API.';
        console.warn('fetchTradeOffersForUserViaWeb', e);
        return { offers: [] as TradeOfferVM[], viewerId: null as string | null };
      })
    : { offers: [] as TradeOfferVM[], viewerId: null as string | null };
  if (webRows.viewerId) participantUserId = webRows.viewerId;

  const sb = getSupabase();
  if (!sb) {
    return { offers: webRows.offers, participantUserId, loadError };
  }

  const participantIds = [...new Set([userId, participantUserId].filter(Boolean))];
  const supabaseOr = participantIds
    .flatMap((id) => [`sender_id.eq.${id}`, `recipient_id.eq.${id}`])
    .join(',');

  const { data: rows, error } = await sb
    .from('trade_offers')
    .select('*')
    .or(supabaseOr)
    .order('updated_at', { ascending: false });
  if (error || !rows?.length) {
    if (error) console.warn('fetchTradeOffersForUser', error.message);
    return { offers: webRows.offers, participantUserId, loadError };
  }
  const webIds = new Set(webRows.offers.map((r) => r.id));
  const tradeRows = (rows as TradeRow[]).filter((r) => !webIds.has(r.id));
  if (!tradeRows.length) {
    return { offers: webRows.offers, participantUserId, loadError };
  }

  const listingIds = new Set<string>();
  const profileIds = new Set<string>();
  for (const r of tradeRows) {
    listingIds.add(r.requested_item_id);
    profileIds.add(r.sender_id);
    profileIds.add(r.recipient_id);
    for (const id of r.offered_item_ids ?? []) listingIds.add(id);
  }
  const [lm, pm] = await Promise.all([
    fetchListingsMap(sb, [...listingIds]),
    fetchProfilesMap(sb, [...profileIds]),
  ]);
  const legacyRows = tradeRows.map((r) => buildVm(r, lm, pm)).filter(Boolean) as TradeOfferVM[];
  return {
    offers: [...webRows.offers, ...legacyRows].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    ),
    participantUserId,
    loadError,
  };
}

export async function fetchTradeOfferById(offerId: string): Promise<TradeOfferVM | null> {
  if (isWebTradeApiConfigured()) {
    const webRow = await fetchTradeOfferDetailViaWeb(offerId);
    if (webRow) return webRow;
  }

  const sb = getSupabase();
  if (!sb) return null;
  const { data: row, error } = await sb.from('trade_offers').select('*').eq('id', offerId).maybeSingle();
  if (error || !row) return null;
  const t = row as TradeRow;
  const listingIds = [t.requested_item_id, ...(t.offered_item_ids ?? [])];
  const profileIds = [t.sender_id, t.recipient_id];
  const [lm, pm] = await Promise.all([
    fetchListingsMap(sb, listingIds),
    fetchProfilesMap(sb, profileIds),
  ]);
  return buildVm(t, lm, pm);
}

export async function fetchShippingLabelsForTrade(tradeId: string): Promise<ShippingLabelVM[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('shipping_labels')
    .select(
      'id, user_id, sender_user_id, recipient_user_id, carrier, service_level, label_url, tracking_number, tracking_url, status, ship_by_date, cost',
    )
    .eq('trade_id', tradeId);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    sender_user_id: (r.sender_user_id as string) ?? null,
    recipient_user_id: (r.recipient_user_id as string) ?? null,
    carrier: (r.carrier as string) ?? null,
    service_level: (r.service_level as string) ?? null,
    label_url: (r.label_url as string) ?? null,
    tracking_number: (r.tracking_number as string) ?? null,
    tracking_url: (r.tracking_url as string) ?? null,
    status: (r.status as string) ?? 'pending',
    ship_by_date: (r.ship_by_date as string) ?? null,
    cost: r.cost != null ? num(r.cost as number | string) : null,
  }));
}

export async function insertTradeOffer(params: {
  senderId: string;
  requestedListingId: string;
  offeredListingIds: string[];
  cashDifference: number;
  message: string | null;
  weightTier: ShippingWeightTier;
}): Promise<string> {
  if (isWebTradeApiConfigured()) {
    return createTradeOfferViaWeb({
      requestedListingIds: [params.requestedListingId],
      offeredListingIds: params.offeredListingIds,
      cashDifference: params.cashDifference,
      message: params.message,
      weightTier: params.weightTier,
    });
  }

  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');

  const published = await fetchListingsByIdsFromWeb([params.requestedListingId]);
  const requested = published.find((l) => l.id === params.requestedListingId);
  const recipientId = requested?.sellerId;
  if (!recipientId) throw new Error('Requested listing not found');
  if (recipientId === params.senderId) throw new Error('Cannot trade with yourself');

  const accessToken = await getListingsAccessToken();
  const mine = await fetchMyListingsFromWeb(accessToken);
  const mineIds = new Set(
    mine
      .filter((l) => l.sellerId === params.senderId && (l.status === 'active' || l.status === 'auction_live'))
      .map((l) => l.id),
  );
  for (const oid of params.offeredListingIds) {
    if (!mineIds.has(oid)) {
      throw new Error('You can only offer listings you own');
    }
  }
  const fee = tradeFeeUsdForTier(params.weightTier);
  const metadata: Record<string, unknown> = {};
  if (shouldAttachDevShipFrom()) {
    metadata.shippo_label = { ship_from: devPlaceholderShipFrom(params.senderId, recipientId) };
  }
  const { data: ins, error } = await sb
    .from('trade_offers')
    .insert({
      sender_id: params.senderId,
      recipient_id: recipientId,
      requested_item_id: params.requestedListingId,
      offered_item_ids: params.offeredListingIds,
      cash_difference: params.cashDifference,
      message: params.message,
      status: 'awaiting_response' as TradeOfferStatus,
      trade_fee: fee,
      shipping_weight_tier: params.weightTier,
      metadata,
    })
    .select('id')
    .single();
  if (error || !ins) throw new Error(error?.message ?? 'Insert failed');
  return ins.id as string;
}

export async function acceptTradeOfferAsRecipient(offerId: string, recipientId: string): Promise<'accepted' | 'fee_due'> {
  if (isWebTradeApiConfigured()) {
    try {
      await acceptTradeOfferViaWeb(offerId);
      return 'accepted';
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!msg.toLowerCase().includes('not found')) throw e;
    }
  }

  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { error } = await sb
    .from('trade_offers')
    .update({ status: 'fee_due' as TradeOfferStatus })
    .eq('id', offerId)
    .eq('recipient_id', recipientId);
  if (error) throw new Error(error.message);
  return 'fee_due';
}

export async function declineTradeOfferAsRecipient(offerId: string, recipientId: string): Promise<void> {
  if (isWebTradeApiConfigured()) {
    try {
      await declineTradeOfferViaWeb(offerId);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!msg.toLowerCase().includes('not found')) throw e;
    }
  }

  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { error } = await sb
    .from('trade_offers')
    .update({ status: 'declined' as TradeOfferStatus })
    .eq('id', offerId)
    .eq('recipient_id', recipientId);
  if (error) throw new Error(error.message);
}

export async function submitCounterOffer(params: {
  offerId: string;
  actorId: string;
  message: string;
  cashDifference: number;
}): Promise<void> {
  if (isWebTradeApiConfigured()) {
    try {
      await counterTradeOfferViaWeb({
        offerId: params.offerId,
        cashDifference: params.cashDifference,
        message: params.message,
      });
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!msg.toLowerCase().includes('not found')) throw e;
    }
  }

  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { error } = await sb
    .from('trade_offers')
    .update({
      status: 'countered' as TradeOfferStatus,
      message: params.message,
      cash_difference: params.cashDifference,
    })
    .eq('id', params.offerId)
    .or(`recipient_id.eq.${params.actorId},sender_id.eq.${params.actorId}`);
  if (error) throw new Error(error.message);
}

export function subscribeTradeOffer(
  offerId: string,
  onChange: (row: Pick<TradeRow, 'id' | 'status' | 'label_error_message' | 'updated_at'>) => void,
): { unsubscribe: () => void } {
  const sb = getSupabase();
  if (!sb) return { unsubscribe: () => {} };
  const channel = sb
    .channel(`trade-offer-${offerId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trade_offers', filter: `id=eq.${offerId}` },
      (payload) => {
        const n = payload.new as TradeRow;
        if (n?.id) onChange({ id: n.id, status: n.status, label_error_message: n.label_error_message, updated_at: n.updated_at });
      },
    )
    .subscribe();
  return {
    unsubscribe: () => {
      sb.removeChannel(channel);
    },
  };
}

/** Resolves the sellerId of a published listing so callers can scope a trade to that one seller. */
export async function resolvePublishedListingSellerId(listingId: string): Promise<string | null> {
  const rows = await fetchPublishedListingsFromWeb();
  return rows.find((l) => l.id === listingId)?.sellerId ?? null;
}

/**
 * Tradeable listings from other sellers, optionally scoped to a single target seller.
 *
 * Pass `targetSellerId` whenever the trade was initiated from a specific listing (e.g. tapping
 * "Trade" on a listing's detail page) so "What you'll get" only shows that seller's inventory —
 * without it, this would leak every other seller's tradeable listings into the picker.
 */
export async function fetchLiveListingsExcludingSeller(
  sbUserId: string,
  targetSellerId?: string,
): Promise<ListingLite[]> {
  const rows = await fetchPublishedListingsFromWeb();
  return rows
    .filter(
      (l) =>
        l.sellerId &&
        l.sellerId !== sbUserId &&
        (!targetSellerId || l.sellerId === targetSellerId) &&
        l.acceptTradeOffers &&
        (l.listingStatus === 'active' || l.listingStatus === 'auction_live'),
    )
    .slice(0, 40)
    .map((l) => listingLiteFromWebListing(l));
}

export async function fetchMyLiveListings(sellerId: string): Promise<ListingLite[]> {
  try {
    const token = await getListingsAccessToken();
    const rows = await fetchMyListingsFromWeb(token);
    return rows
      .filter(
        (l) =>
          l.sellerId === sellerId &&
          (l.status === 'active' || l.status === 'auction_live') &&
          l.acceptTradeOffers,
      )
      .slice(0, 60)
      .map((l) =>
        listingLiteFromWebListing({
          id: l.id,
          title: l.title,
          price: typeof l.price === 'number' ? l.price : 1,
          imageUrls: l.imageDataUrls,
          condition: l.condition ?? '',
        }),
      );
  } catch {
    return [];
  }
}

/** Statuses exposed by Trade Center QA force-status panel. */
export const QA_FORCEABLE_TRADE_STATUSES: readonly TradeOfferStatus[] = [
  'sent',
  'awaiting_response',
  'countered',
  'accepted',
  'fee_due',
  'labels_pending',
  'labels_generating',
  'labels_generated',
  'label_error',
  'shipped',
  'delivered',
  'completed',
  'disputed',
] as const;

export async function qaCreateIncomingDemoTrade(params: {
  demoSenderId: string;
  requestedListingId: string;
  offeredListingIds: string[];
}): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { data, error } = await sb.rpc('qa_create_incoming_trade_from_demo', {
    p_demo_sender_id: params.demoSenderId,
    p_requested_item_id: params.requestedListingId,
    p_offered_item_ids: params.offeredListingIds,
  });
  if (error) throw new Error(error.message);
  const id = typeof data === 'string' ? data : (data as { id?: string } | null)?.id;
  if (!id) throw new Error('qa_create_incoming_trade_from_demo returned no id');
  return id;
}

export async function qaUpsertMockShippingLabelsRpc(tradeId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { error } = await sb.rpc('qa_upsert_mock_shipping_labels', { p_trade_id: tradeId });
  if (error) throw new Error(error.message);
}

export async function qaMockLabelsGeneratedPipeline(tradeId: string): Promise<void> {
  await qaUpsertMockShippingLabelsRpc(tradeId);
  await devForceTradeOfferStatus(tradeId, 'labels_generated');
}

export async function devForceTradeOfferStatus(tradeId: string, status: TradeOfferStatus): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const patch: Record<string, unknown> = { status };
  if (status !== 'label_error') {
    patch.label_error_message = null;
  }
  const { error } = await sb.from('trade_offers').update(patch).eq('id', tradeId);
  if (error) throw new Error(error.message);
}

export async function devTriggerTradeLabelError(
  tradeId: string,
  message = 'QA: simulated Shippo / label pipeline failure.',
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { error } = await sb
    .from('trade_offers')
    .update({ status: 'label_error' as TradeOfferStatus, label_error_message: message })
    .eq('id', tradeId);
  if (error) throw new Error(error.message);
}

/** Inserts one published trade-eligible listing via the shared web listings API. */
export async function insertQaPlaceholderListingForCurrentUser(_userId: string): Promise<string> {
  const token = await getListingsAccessToken();
  const { listingId } = await createListingViaWeb(token, {
    title: 'QA trade listing (placeholder)',
    description: 'Auto-created by Trade Center QA setup tools',
    category: 'Other',
    condition: 'Other',
    buyingFormat: 'buy_now',
    priceUsd: 1,
    status: 'active',
    images: ['https://placehold.co/600x400/png'],
    acceptTradeOffers: true,
    allowOffers: false,
    signatureRequired: false,
    shippingPriceUsd: 0,
    handlingTime: '—',
    shippingCategory: 'raw_card',
    parcelWeightOz: 16,
    parcelLengthIn: 6,
    parcelWidthIn: 6,
    parcelHeightIn: 6,
  });
  return listingId;
}

/** QA RPC: inserts a live listing for the demo partner (requires migration qa_seed_partner_trade_listing). */
export async function qaSeedPartnerListingViaRpc(partnerUserId: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { data, error } = await sb.rpc('qa_seed_partner_trade_listing', { p_partner_user_id: partnerUserId });
  if (error) throw new Error(error.message);
  const id = typeof data === 'string' ? data : (data as { id?: string } | null)?.id;
  if (!id) throw new Error('qa_seed_partner_trade_listing returned no id');
  return id;
}
