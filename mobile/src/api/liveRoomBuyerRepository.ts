import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { WalletIncompleteError } from '../lib/buyerWalletErrors';
import { liveAuctionMinBidUsd } from '../lib/liveAuctionBidMath';
import {
  resolveLiveAuctionLotBidPhase,
  type LiveAuctionLotBidPhase,
} from '../lib/liveAuctionLotPhase';

export type LiveRoomBuyerSnapshot = {
  roomId: string;
  status: 'scheduled' | 'live' | 'ended';
  roomType: 'auction' | 'sale' | 'break';
  activeItemId: string | null;
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
};

function apiErrorMessage(res: Response, body: unknown): string {
  if (body && typeof body === 'object') {
    const o = body as { error?: string; signInUrl?: string };
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
  }
  return `Request failed (${res.status})`;
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
  const res = await fetch(`${base}/api/live-rooms/${encodeURIComponent(roomId)}`, { headers });
  let j: {
    room?: {
      status?: string;
      roomType?: string;
      buyerLiveBidPaymentReady?: boolean;
      buyerLiveShippingReady?: boolean;
      activeItem?: {
        id?: string;
        status?: string;
        biddingOpen?: boolean;
        currentBidUsd?: number | null;
        startingBidUsd?: number | null;
        priceUsd?: number | null;
        lastHighBidderId?: string | null;
        lastHighBidderUsername?: string | null;
        auctionEndsAt?: string | null;
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
  const fetchedAtMs = Date.now();
  const lotBidPhase = resolveLiveAuctionLotBidPhase(
    {
      status: active?.status ?? 'active',
      biddingOpen: active?.biddingOpen,
      auctionEndsAt: active?.auctionEndsAt,
    },
    fetchedAtMs,
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
  return {
    roomId,
    status: (detail?.status as LiveRoomBuyerSnapshot['status']) ?? 'ended',
    roomType: (detail?.roomType as LiveRoomBuyerSnapshot['roomType']) ?? 'auction',
    activeItemId: active?.id?.trim() || null,
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
  };
}

export function createLiveBidIdempotencyKey(): string {
  return `bid-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function placeLiveRoomBid(args: {
  accessToken: string;
  roomId: string;
  itemId: string;
  amountUsd: number;
  idempotencyKey: string;
}): Promise<void> {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
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
  let j: {
    error?: string;
    signInUrl?: string;
    code?: string;
    paymentReady?: boolean;
    shippingReady?: boolean;
    addPaymentMethodsUrl?: string;
    addShippingUrl?: string;
  } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (res.status === 402 && j && typeof j === 'object') {
    throw new WalletIncompleteError(j);
  }
  if (!res.ok) {
    throw new Error(apiErrorMessage(res, j));
  }
}
