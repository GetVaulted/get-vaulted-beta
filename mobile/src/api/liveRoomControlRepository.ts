import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import type { LiveRoomHostDetail } from './liveHostRepository';

export type LiveRoomItemRow = {
  id: string;
  title: string;
  displayTitle?: string;
  progressLabel?: string | null;
  quantityInitial?: number;
  soldQuantity?: number;
  remainingQuantity?: number;
  currentUnitNumber?: number | null;
  status: 'queued' | 'active' | 'sold' | 'skipped';
  listingId?: string | null;
  imageUrl?: string;
  quantity?: number;
  currentBidUsd: number | null;
  startingBidUsd: number | null;
  bidIncrementUsd?: number | null;
  reservePriceUsd?: number | null;
  priceUsd: number | null;
  biddingOpen: boolean;
  auctionEndsAt: string | null;
  lastHighBidderUsername?: string | null;
  sortOrder: number;
  salesFormat?: 'auction' | 'buy_now' | 'variant_selection' | 'team_break';
  variants?: {
    id: string;
    label: string;
    priceUsd: number;
    quantityRemaining: number;
    isHot: boolean;
    status: string;
    buyerUsername: string | null;
  }[];
};

function apiErrorMessage(res: Response, body: unknown): string {
  if (body && typeof body === 'object') {
    const o = body as { error?: string; code?: string };
    if (o.code === 'LIVE_COMING_SOON' || res.status === 503) {
      return 'Live is disabled on this server. Redeploy beta or set LIVE_MARKETPLACE_ENABLED=1.';
    }
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
  }
  return `Request failed (${res.status})`;
}

async function controlFetch(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  return fetchWebApiMobile(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
}

export async function fetchLiveRoomDetailWithItems(
  accessToken: string,
  roomId: string,
): Promise<LiveRoomHostDetail & { items: LiveRoomItemRow[]; activeItem: LiveRoomItemRow | null }> {
  const res = await controlFetch(`/api/live-rooms/${encodeURIComponent(roomId)}`, accessToken);
  let j: { room?: LiveRoomHostDetail & { items?: LiveRoomItemRow[]; activeItem?: LiveRoomItemRow | null } } =
    {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  if (!j.room?.id) throw new Error('Room not found.');
  const items = Array.isArray(j.room.items) ? j.room.items : [];
  return {
    ...j.room,
    items,
    activeItem: j.room.activeItem ?? items.find((i) => i.status === 'active') ?? null,
  };
}

export async function createLiveRoomQueueItem(
  accessToken: string,
  roomId: string,
  input: {
    title: string;
    listingId?: string | null;
    quantity?: number | null;
    startingBidUsd?: number | null;
    reservePriceUsd?: number | null;
    priceUsd?: number | null;
  },
): Promise<void> {
  const res = await controlFetch(`/api/live-rooms/${encodeURIComponent(roomId)}/items`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: input.title.trim(),
      listingId: input.listingId ?? null,
      quantity: input.quantity ?? 1,
      startingBidUsd: input.startingBidUsd ?? null,
      reservePriceUsd: input.reservePriceUsd ?? null,
      priceUsd: input.priceUsd ?? null,
    }),
  });
  let j: unknown;
  try {
    j = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
}

export async function patchLiveRoomItem(
  accessToken: string,
  roomId: string,
  itemId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await controlFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/items/${encodeURIComponent(itemId)}`,
    accessToken,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  let j: unknown;
  try {
    j = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
}

export async function deleteLiveRoomQueueItem(
  accessToken: string,
  roomId: string,
  itemId: string,
): Promise<void> {
  const res = await controlFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/items/${encodeURIComponent(itemId)}`,
    accessToken,
    { method: 'DELETE' },
  );
  let j: unknown;
  try {
    j = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
}
