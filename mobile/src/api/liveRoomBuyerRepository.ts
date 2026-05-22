import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
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
  /** Break rooms — from API `room.break` when present. */
  breakPhase?: 'not_started' | 'filling' | 'randomizing' | 'ready' | 'in_progress' | 'complete' | null;
  breakLockPurchases?: boolean;
  breakPaused?: boolean;
  breakFull?: boolean;
};

function apiErrorMessage(res: Response, body: unknown): string {
  if (body && typeof body === 'object') {
    const o = body as { error?: string; signInUrl?: string };
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
  }
  return `Request failed (${res.status})`;
}

function minNextBidUsd(currentHighUsd: number): number {
  const inc = Math.max(1, Math.ceil(currentHighUsd / 25));
  return currentHighUsd + inc;
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
      activeItem?: {
        id?: string;
        status?: string;
        biddingOpen?: boolean;
        currentBidUsd?: number | null;
        startingBidUsd?: number | null;
        auctionEndsAt?: string | null;
      } | null;
      break?: {
        phase?: string;
        lockPurchases?: boolean;
        breakPaused?: boolean;
        breakFull?: boolean;
      } | null;
    };
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
  const starting = active?.startingBidUsd ?? 0;
  const currentHigh =
    typeof highBid === 'number' && Number.isFinite(highBid) && highBid > 0
      ? highBid
      : typeof starting === 'number' && Number.isFinite(starting)
        ? starting
        : 0;
  const minNext = active ? minNextBidUsd(currentHigh) : null;
  const current = typeof highBid === 'number' && Number.isFinite(highBid) ? highBid : currentHigh;
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
    breakPhase,
    breakLockPurchases: breakSnap?.lockPurchases === true,
    breakPaused: breakSnap?.breakPaused === true,
    breakFull: breakSnap?.breakFull === true,
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
  let j: { error?: string; signInUrl?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (res.status === 402 && j && typeof j === 'object') {
    const wallet = j as { error?: string; walletIncomplete?: boolean };
    throw new Error(wallet.error ?? 'Add a payment method and shipping address before bidding.');
  }
  if (!res.ok) {
    throw new Error(apiErrorMessage(res, j));
  }
}
