import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { WalletIncompleteError } from '../lib/buyerWalletErrors';
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
  status: string;
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
    const status = typeof o.status === 'string' ? o.status : 'available';
    const buyerUsername =
      typeof o.buyerUsername === 'string' && o.buyerUsername.trim() ? o.buyerUsername.trim() : null;
    out.push({ id, label, priceUsd, quantityRemaining, soldCount, isHot, status, buyerUsername });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
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
  return {
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
  };
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
