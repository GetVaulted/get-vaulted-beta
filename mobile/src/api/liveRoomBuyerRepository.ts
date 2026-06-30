import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import { sortVariantsForBuyerDisplay } from '../lib/liveItemVariant';
import { WalletIncompleteError } from '../lib/buyerWalletErrors';
import { logBuyerRoomStateSnapshot } from '../lib/logRoomStateSnapshot';
import { liveAuctionMinBidUsd } from '../lib/liveAuctionBidMath';
import type { ViewerGiveawayRow } from './liveGiveawayRepository';
import {
  resolveLiveAuctionLotBidPhase,
  type LiveAuctionLotBidPhase,
} from '../lib/liveAuctionLotPhase';
import { projectBuyerQueueLineup, type LiveRoomLineupItemSnapshot } from '../lib/liveBuyerQueueProjection';

export type { LiveRoomLineupItemSnapshot };

export type LiveItemSalesFormat = 'auction' | 'buy_now' | 'variant_selection' | 'team_break';

export type LiveItemVariantSnapshot = {
  id: string;
  label: string;
  priceUsd: number;
  quantityRemaining: number;
  soldCount: number;
  isHot: boolean;
  sortOrder: number;
  status: string;
  buyerUsername: string | null;
  color?: string | null;
};

export type LiveBuyerPaymentFailureSnapshot = {
  id: string;
  kind: string;
  liveRoomItemId: string | null;
  orderId: string | null;
  variantPurchaseId: string | null;
  breakSpotId: string | null;
  amountUsd: number;
  status: 'payment_failed' | 'recovery_pending';
  failureReason: string | null;
  failedAt: string;
  itemTitle: string | null;
  buyerUsername: string | null;
};

export type LiveRoomBuyerSnapshot = {
  roomId: string;
  status: 'scheduled' | 'live' | 'ended';
  roomType: 'auction' | 'sale' | 'break';
  activeItemId: string | null;
  activeItemTitle?: string | null;
  activeItemImageUrl?: string | null;
  activeItemSalesFormat?: LiveItemSalesFormat | null;
  activeItemListingId?: string | null;
  activeItemVariantAssignmentMode?: 'pick' | 'random' | null;
  activeItemVariants?: LiveItemVariantSnapshot[];
  /** PYT/PYD pinned spot mode (`fixed` = hold to buy, `auction` = timed bids). */
  activeSpotCommerceMode?: 'fixed' | 'auction' | null;
  auctionVariantId?: string | null;
  biddingOpen: boolean;
  currentBidUsd: number | null;
  minNextBidUsd: number | null;
  auctionEndsAt: string | null;
  lotBidPhase: LiveAuctionLotBidPhase;
  /** Client wall time when this snapshot was fetched (for stale-sync UX). */
  fetchedAtMs: number;
  /** Server time from GET response (timer sync). */
  serverNowMs?: number;
  /** Monotonic auction event counter from GET (bid_placed dedupe seed). */
  auctionEventSeq?: number;
  /** Break rooms — from API `room.break` when present. */
  breakPhase?: 'not_started' | 'filling' | 'randomizing' | 'ready' | 'in_progress' | 'complete' | null;
  breakLockPurchases?: boolean;
  breakPaused?: boolean;
  breakFull?: boolean;
  /** From GET /api/live-rooms/:id when authenticated buyer. */
  /** Resolved high bidder @handle from GET / activeItem enrichment. */
  lastHighBidderUsername?: string | null;
  lastHighBidderId?: string | null;
  startingBidUsd?: number | null;
  priceUsd?: number | null;
  paymentReady?: boolean | null;
  shippingReady?: boolean | null;
  /** Unresolved payment failure — buyer must recover before commerce in this room. */
  unresolvedPaymentFailure?: LiveBuyerPaymentFailureSnapshot | null;
  /** Open giveaways accepting entries (watch UI). */
  giveaways?: ViewerGiveawayRow[];
  /** Host queue aligned lineup (auction + buy-now + PYT/PYD masters). */
  lineupItems?: LiveRoomLineupItemSnapshot[];
};

import { LiveBidError } from '../lib/liveBidUserErrors';

function apiErrorMessage(res: Response, body: unknown): string {
  if (body && typeof body === 'object') {
    const o = body as { error?: string; signInUrl?: string };
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
  }
  return `Request failed (${res.status})`;
}

function parseSalesFormat(raw: unknown): LiveItemSalesFormat | null {
  if (raw === 'auction' || raw === 'buy_now' || raw === 'variant_selection' || raw === 'team_break') {
    return raw;
  }
  return null;
}

function parseVariantSnapshots(raw: unknown): LiveItemVariantSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: LiveItemVariantSnapshot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    if (!id || !label) continue;
    const priceUsd = typeof o.priceUsd === 'number' && Number.isFinite(o.priceUsd) ? o.priceUsd : 0;
    const quantityRemaining =
      typeof o.quantityRemaining === 'number' && Number.isFinite(o.quantityRemaining)
        ? Math.max(0, Math.floor(o.quantityRemaining))
        : 0;
    const soldCount =
      typeof o.soldCount === 'number' && Number.isFinite(o.soldCount) ? Math.max(0, Math.floor(o.soldCount)) : 0;
    const isHot = o.isHot === true;
    const sortOrder =
      typeof o.sortOrder === 'number' && Number.isFinite(o.sortOrder) ? Math.floor(o.sortOrder) : out.length;
    const status = typeof o.status === 'string' ? o.status : 'available';
    const buyerUsername =
      typeof o.buyerUsername === 'string' && o.buyerUsername.trim() ? o.buyerUsername.trim() : null;
    const color = typeof o.color === 'string' && o.color.trim() ? o.color.trim() : null;
    out.push({ id, label, priceUsd, quantityRemaining, soldCount, isHot, sortOrder, status, buyerUsername, color });
  }
  return sortVariantsForBuyerDisplay(out);
}

function parseViewerGiveaways(raw: unknown): ViewerGiveawayRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ViewerGiveawayRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    if (!id || !title) continue;
    out.push({
      id,
      kind: o.kind === 'buyers' ? 'buyers' : 'open',
      title,
      prizeDescription: typeof o.prizeDescription === 'string' ? o.prizeDescription : '',
      imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : '',
      status: typeof o.status === 'string' ? o.status : 'draft',
      entryCount: typeof o.entryCount === 'number' && Number.isFinite(o.entryCount) ? o.entryCount : 0,
      entryCloseAt: typeof o.entryCloseAt === 'string' ? o.entryCloseAt : null,
      viewerEntered: o.viewerEntered === true,
      canEnter: o.canEnter === true,
    });
  }
  return out;
}

function parsePaymentFailure(raw: unknown): LiveBuyerPaymentFailureSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  if (!id) return null;
  const amountUsd = typeof o.amountUsd === 'number' && Number.isFinite(o.amountUsd) ? o.amountUsd : 0;
  const status = o.status === 'recovery_pending' ? 'recovery_pending' : 'payment_failed';
  return {
    id,
    kind: typeof o.kind === 'string' ? o.kind : 'auction_win',
    liveRoomItemId: typeof o.liveRoomItemId === 'string' ? o.liveRoomItemId : null,
    orderId: typeof o.orderId === 'string' ? o.orderId : null,
    variantPurchaseId: typeof o.variantPurchaseId === 'string' ? o.variantPurchaseId : null,
    breakSpotId: typeof o.breakSpotId === 'string' ? o.breakSpotId : null,
    amountUsd,
    status,
    failureReason: typeof o.failureReason === 'string' ? o.failureReason : null,
    failedAt: typeof o.failedAt === 'string' ? o.failedAt : new Date().toISOString(),
    itemTitle: typeof o.itemTitle === 'string' ? o.itemTitle : null,
    buyerUsername: typeof o.buyerUsername === 'string' ? o.buyerUsername : null,
  };
}

function parseRoomLineupItems(raw: unknown): Parameters<typeof projectBuyerQueueLineup>[0] {
  if (!Array.isArray(raw)) return [];
  const out: Parameters<typeof projectBuyerQueueLineup>[0] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    if (!id) continue;
    out.push({
      id,
      title: typeof o.title === 'string' ? o.title : undefined,
      displayTitle: typeof o.displayTitle === 'string' ? o.displayTitle : null,
      progressLabel: typeof o.progressLabel === 'string' ? o.progressLabel : null,
      imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : null,
      priceUsd: typeof o.priceUsd === 'number' ? o.priceUsd : null,
      startingBidUsd: typeof o.startingBidUsd === 'number' ? o.startingBidUsd : null,
      currentBidUsd: typeof o.currentBidUsd === 'number' ? o.currentBidUsd : null,
      lastHighBidderId: typeof o.lastHighBidderId === 'string' ? o.lastHighBidderId : null,
      lastHighBidderUsername: typeof o.lastHighBidderUsername === 'string' ? o.lastHighBidderUsername : null,
      status: typeof o.status === 'string' ? o.status : 'queued',
      sortOrder: typeof o.sortOrder === 'number' ? o.sortOrder : out.length,
      biddingOpen: o.biddingOpen === true,
      auctionEndsAt: typeof o.auctionEndsAt === 'string' ? o.auctionEndsAt : null,
      salesFormat: typeof o.salesFormat === 'string' ? o.salesFormat : 'auction',
      listingId: typeof o.listingId === 'string' ? o.listingId : null,
      variants: parseVariantSnapshots(o.variants),
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : undefined,
    });
  }
  return out;
}

/** Buyer snapshot for placing bids from mobile (same room GET as web). */
export async function fetchLiveRoomBuyerSnapshot(
  accessToken: string | undefined,
  roomId: string,
): Promise<LiveRoomBuyerSnapshot> {
  const headers: Record<string, string> = {};
  if (accessToken?.trim()) headers.Authorization = `Bearer ${accessToken}`;
  const clientStart = Date.now();
  const res = await fetchWebApiMobile(`/api/live-rooms/${encodeURIComponent(roomId)}`, { headers });
  let j: {
    room?: {
      status?: string;
      roomType?: string;
      auctionEventSeq?: number;
      buyerLiveBidPaymentReady?: boolean;
      buyerLiveShippingReady?: boolean;
      buyerUnresolvedPaymentFailure?: unknown;
      activeItem?: {
        id?: string;
        title?: string;
        displayTitle?: string;
        imageUrl?: string | null;
        salesFormat?: string;
        listingId?: string | null;
        status?: string;
        biddingOpen?: boolean;
        currentBidUsd?: number | null;
        startingBidUsd?: number | null;
        priceUsd?: number | null;
        lastHighBidderId?: string | null;
        lastHighBidderUsername?: string | null;
        auctionEndsAt?: string | null;
        variantAssignmentMode?: 'pick' | 'random';
        variants?: unknown;
        activeSpotCommerceMode?: 'fixed' | 'auction' | null;
        auctionVariantId?: string | null;
      } | null;
      break?: {
        phase?: string;
        lockPurchases?: boolean;
        breakPaused?: boolean;
        breakFull?: boolean;
      } | null;
      giveaways?: unknown;
      items?: unknown;
    };
    serverNowMs?: number;
    error?: string;
  } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  const detail = j.room;
  const active = detail?.activeItem;
  const highBid = active?.currentBidUsd;
  const starting = active?.startingBidUsd ?? 1;
  const hasAcceptedBid = Boolean(active?.lastHighBidderId?.trim());
  const currentHigh =
    hasAcceptedBid && typeof highBid === 'number' && Number.isFinite(highBid) && highBid > 0
      ? highBid
      : typeof starting === 'number' && Number.isFinite(starting)
        ? starting
        : typeof highBid === 'number' && Number.isFinite(highBid)
          ? highBid
          : 0;
  const minNext = active
    ? liveAuctionMinBidUsd({
        currentBidUsd: typeof highBid === 'number' ? highBid : null,
        startingBidUsd: active.startingBidUsd,
        priceUsd: active.priceUsd,
        lastHighBidderId: active.lastHighBidderId,
      })
    : null;
  const current = hasAcceptedBid && typeof highBid === 'number' && Number.isFinite(highBid) ? highBid : currentHigh;
  const clientEnd = Date.now();
  const fetchedAtMs = clientEnd;
  const serverNowMs = typeof j.serverNowMs === 'number' ? j.serverNowMs : undefined;
  const clockSkewMs =
    typeof serverNowMs === 'number' ? serverNowMs - (clientStart + clientEnd) / 2 : 0;
  const phaseNowMs = typeof serverNowMs === 'number' ? serverNowMs : fetchedAtMs + clockSkewMs;
  const lotBidPhase = resolveLiveAuctionLotBidPhase(
    {
      status: active?.status ?? 'active',
      biddingOpen: active?.biddingOpen,
      auctionEndsAt: active?.auctionEndsAt,
    },
    phaseNowMs,
  );
  const breakSnap = detail?.break;
  const breakPhaseRaw = breakSnap?.phase?.trim();
  const breakPhase =
    breakPhaseRaw === 'not_started' ||
    breakPhaseRaw === 'filling' ||
    breakPhaseRaw === 'randomizing' ||
    breakPhaseRaw === 'ready' ||
    breakPhaseRaw === 'in_progress' ||
    breakPhaseRaw === 'complete'
      ? breakPhaseRaw
      : null;
  const activeVariants = parseVariantSnapshots(active?.variants);
  const activeSalesFormat = parseSalesFormat(active?.salesFormat);
  const activeTitle =
    (typeof active?.displayTitle === 'string' && active.displayTitle.trim()) ||
    (typeof active?.title === 'string' && active.title.trim()) ||
    null;
  const lineupItems = projectBuyerQueueLineup(parseRoomLineupItems(detail?.items), phaseNowMs);
  const snapshot: LiveRoomBuyerSnapshot = {
    roomId,
    status: (detail?.status as LiveRoomBuyerSnapshot['status']) ?? 'ended',
    roomType: (detail?.roomType as LiveRoomBuyerSnapshot['roomType']) ?? 'auction',
    activeItemId: active?.id?.trim() || null,
    activeItemTitle: activeTitle,
    activeItemImageUrl: typeof active?.imageUrl === 'string' ? active.imageUrl : null,
    activeItemSalesFormat: activeSalesFormat,
    activeItemListingId: typeof active?.listingId === 'string' ? active.listingId.trim() || null : null,
    activeItemVariantAssignmentMode:
      active?.variantAssignmentMode === 'random' ? 'random' : active ? 'pick' : null,
    activeItemVariants: activeVariants.length > 0 ? activeVariants : undefined,
    activeSpotCommerceMode:
      active?.activeSpotCommerceMode === 'auction' || active?.activeSpotCommerceMode === 'fixed'
        ? active.activeSpotCommerceMode
        : null,
    auctionVariantId:
      typeof active?.auctionVariantId === 'string' && active.auctionVariantId.trim()
        ? active.auctionVariantId.trim()
        : null,
    biddingOpen: lotBidPhase === 'bidding_open',
    currentBidUsd: typeof current === 'number' ? current : null,
    minNextBidUsd: minNext,
    auctionEndsAt: active?.auctionEndsAt ?? null,
    lotBidPhase,
    fetchedAtMs,
    serverNowMs: typeof j.serverNowMs === 'number' ? j.serverNowMs : undefined,
    breakPhase,
    breakLockPurchases: breakSnap?.lockPurchases === true,
    breakPaused: breakSnap?.breakPaused === true,
    breakFull: breakSnap?.breakFull === true,
    paymentReady: typeof detail?.buyerLiveBidPaymentReady === 'boolean' ? detail.buyerLiveBidPaymentReady : null,
    shippingReady: typeof detail?.buyerLiveShippingReady === 'boolean' ? detail.buyerLiveShippingReady : null,
    lastHighBidderUsername: active?.lastHighBidderUsername?.trim() || null,
    lastHighBidderId: active?.lastHighBidderId?.trim() || null,
    startingBidUsd: typeof active?.startingBidUsd === 'number' ? active.startingBidUsd : null,
    priceUsd: typeof active?.priceUsd === 'number' ? active.priceUsd : null,
    unresolvedPaymentFailure: parsePaymentFailure(detail?.buyerUnresolvedPaymentFailure),
    giveaways: parseViewerGiveaways(detail?.giveaways),
    lineupItems,
    auctionEventSeq:
      typeof detail?.auctionEventSeq === 'number' && Number.isFinite(detail.auctionEventSeq)
        ? Math.max(0, Math.floor(detail.auctionEventSeq))
        : undefined,
  };
  logBuyerRoomStateSnapshot('fetch', snapshot);
  return snapshot;
}

export function createLiveBidIdempotencyKey(): string {
  return `bid-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export type LiveBidHttpAck = {
  serverNowMs?: number;
  roomVersion?: number;
  auctionSeq?: number;
  item?: {
    id?: string;
    auctionEndsAt?: string | null;
    biddingOpen?: boolean;
    currentBidUsd?: number | null;
    startingBidUsd?: number | null;
    lastHighBidderId?: string | null;
    lastHighBidderUsername?: string | null;
    itemVersion?: number;
  };
};

export async function placeLiveRoomBid(args: {
  accessToken: string;
  roomId: string;
  itemId: string;
  amountUsd: number;
  maxProxyUsd?: number;
  idempotencyKey: string;
}): Promise<LiveBidHttpAck> {
  const clientStart = Date.now();
  const body: { amountUsd: number; maxProxyUsd?: number } = { amountUsd: args.amountUsd };
  if (args.maxProxyUsd != null && Number.isFinite(args.maxProxyUsd)) {
    body.maxProxyUsd = args.maxProxyUsd;
  }
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(args.roomId)}/items/${encodeURIComponent(args.itemId)}/bid`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.accessToken}`,
        'Idempotency-Key': args.idempotencyKey,
      },
      body: JSON.stringify(body),
    },
  );
  let j: LiveBidHttpAck & {
    error?: string;
    signInUrl?: string;
    code?: string;
    minNextBidUsd?: number;
    paymentReady?: boolean;
    shippingReady?: boolean;
    addPaymentMethodsUrl?: string;
    addShippingUrl?: string;
    ok?: boolean;
  } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (res.status === 402 && j && typeof j === 'object') {
    throw new WalletIncompleteError(j);
  }
  if (res.status === 403 && j?.code === 'LIVE_PAYMENT_BLOCKED') {
    const err = new Error(typeof j.error === 'string' ? j.error : 'Payment failed — update your payment method.');
    (err as Error & { code?: string }).code = 'LIVE_PAYMENT_BLOCKED';
    throw err;
  }
  if (!res.ok) {
    const code = typeof j.code === 'string' ? j.code : undefined;
    const minNextBidUsd =
      typeof j.minNextBidUsd === 'number' && Number.isFinite(j.minNextBidUsd) ? j.minNextBidUsd : undefined;
    throw new LiveBidError(apiErrorMessage(res, j), { code, minNextBidUsd, status: res.status });
  }
  void clientStart;
  return {
    serverNowMs: j.serverNowMs,
    roomVersion: j.roomVersion,
    auctionSeq: j.auctionSeq,
    item: j.item,
  };
}

export async function placeLiveRoomPreBid(args: {
  accessToken: string;
  roomId: string;
  itemId: string;
  amountUsd: number;
}): Promise<{ ok: true } | { ok: false; error: string; walletIncomplete?: boolean }> {
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(args.roomId)}/items/${encodeURIComponent(args.itemId)}/pre-bid`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.accessToken}`,
      },
      body: JSON.stringify({ amountUsd: args.amountUsd }),
    },
  );
  let j: { error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (res.status === 402) {
    return { ok: false, error: j.error ?? 'Complete wallet setup to pre-bid.', walletIncomplete: true };
  }
  if (!res.ok) {
    return { ok: false, error: j.error ?? 'Could not place pre-bid.' };
  }
  return { ok: true };
}

/**
 * Server-authoritative timer-zero nudge. Asks the server to finalize any overdue auction lot once
 * the local countdown reaches zero; the server re-checks `auctionEndsAt` against its own clock, so
 * it can never close a lot early. Best-effort — the realtime `purchase_completed` event (and the
 * GET read-sweep) are the backstops. Returns silently on any failure.
 */
export async function finalizeOverdueLiveRoomAuctions(roomId: string, accessToken?: string): Promise<void> {
  try {
    await fetchWebApiMobile(`/api/live-rooms/${encodeURIComponent(roomId)}/finalize-overdue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } catch {
    /* best-effort */
  }
}
