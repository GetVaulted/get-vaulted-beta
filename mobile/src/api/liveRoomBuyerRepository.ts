import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { sortVariantsForBuyerDisplay } from '../lib/liveItemVariant';
import { WalletIncompleteError } from '../lib/buyerWalletErrors';
import { logBuyerRoomStateSnapshot } from '../lib/logRoomStateSnapshot';
import { liveAuctionMinBidUsd } from '../lib/liveAuctionBidMath';
import {
  resolveLiveAuctionLotBidPhase,
  type LiveAuctionLotBidPhase,
} from '../lib/liveAuctionLotPhase';

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
  activeItemVariants?: LiveItemVariantSnapshot[];
  biddingOpen: boolean;
  currentBidUsd: number | null;
  minNextBidUsd: number | null;
  auctionEndsAt: string | null;
  lotBidPhase: LiveAuctionLotBidPhase;
  /** Client wall time when this snapshot was fetched (for stale-sync UX). */
  fetchedAtMs: number;
  /** Server time from GET response (timer sync). */
  serverNowMs?: number;
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
};

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
    out.push({ id, label, priceUsd, quantityRemaining, soldCount, isHot, sortOrder, status, buyerUsername });
  }
  return sortVariantsForBuyerDisplay(out);
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

/** Buyer snapshot for placing bids from mobile (same room GET as web). */
export async function fetchLiveRoomBuyerSnapshot(
  accessToken: string | undefined,
  roomId: string,
): Promise<LiveRoomBuyerSnapshot> {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken?.trim()) headers.Authorization = `Bearer ${accessToken}`;
  const clientStart = Date.now();
  const res = await fetch(`${base}/api/live-rooms/${encodeURIComponent(roomId)}`, { headers });
  let j: {
    room?: {
      status?: string;
      roomType?: string;
      buyerLiveBidPaymentReady?: boolean;
      buyerLiveShippingReady?: boolean;
      buyerUnresolvedPaymentFailure?: unknown;
      activeItem?: {
        id?: string;
        title?: string;
        displayTitle?: string;
        imageUrl?: string | null;
        salesFormat?: string;
        status?: string;
        biddingOpen?: boolean;
        currentBidUsd?: number | null;
        startingBidUsd?: number | null;
        priceUsd?: number | null;
        lastHighBidderId?: string | null;
        lastHighBidderUsername?: string | null;
        auctionEndsAt?: string | null;
        variants?: unknown;
      } | null;
      break?: {
        phase?: string;
        lockPurchases?: boolean;
        breakPaused?: boolean;
        breakFull?: boolean;
      } | null;
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
  const snapshot: LiveRoomBuyerSnapshot = {
    roomId,
    status: (detail?.status as LiveRoomBuyerSnapshot['status']) ?? 'ended',
    roomType: (detail?.roomType as LiveRoomBuyerSnapshot['roomType']) ?? 'auction',
    activeItemId: active?.id?.trim() || null,
    activeItemTitle: activeTitle,
    activeItemImageUrl: typeof active?.imageUrl === 'string' ? active.imageUrl : null,
    activeItemSalesFormat: activeSalesFormat,
    activeItemVariants: activeVariants.length > 0 ? activeVariants : undefined,
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
  idempotencyKey: string;
}): Promise<LiveBidHttpAck> {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  const clientStart = Date.now();
  const res = await fetch(
    `${base}/api/live-rooms/${encodeURIComponent(args.roomId)}/items/${encodeURIComponent(args.itemId)}/bid`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.accessToken}`,
        'Idempotency-Key': args.idempotencyKey,
      },
      body: JSON.stringify({ amountUsd: args.amountUsd }),
    },
  );
  let j: LiveBidHttpAck & {
    error?: string;
    signInUrl?: string;
    code?: string;
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
    throw new Error(apiErrorMessage(res, j));
  }
  void clientStart;
  return {
    serverNowMs: j.serverNowMs,
    roomVersion: j.roomVersion,
    auctionSeq: j.auctionSeq,
    item: j.item,
  };
}

/**
 * Server-authoritative timer-zero nudge. Asks the server to finalize any overdue auction lot once
 * the local countdown reaches zero; the server re-checks `auctionEndsAt` against its own clock, so
 * it can never close a lot early. Best-effort — the realtime `purchase_completed` event (and the
 * GET read-sweep) are the backstops. Returns silently on any failure.
 */
export async function finalizeOverdueLiveRoomAuctions(roomId: string, accessToken?: string): Promise<void> {
  const base = getWebApiBaseUrl();
  if (!base) return;
  try {
    await fetch(`${base}/api/live-rooms/${encodeURIComponent(roomId)}/finalize-overdue`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } catch {
    /* best-effort */
  }
}
