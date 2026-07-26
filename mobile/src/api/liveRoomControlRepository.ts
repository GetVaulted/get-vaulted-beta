import { fetchWebApiMobileWithSellerAuth } from '../lib/resolveSellerAccessToken';
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
  lastHighBidderId?: string | null;
  lastHighBidderUsername?: string | null;
  activeSpotCommerceMode?: 'fixed' | 'auction' | null;
  auctionVariantId?: string | null;
  itemVersion?: number;
  sortOrder: number;
  salesFormat?: 'auction' | 'buy_now' | 'variant_selection' | 'team_break';
  variantAssignmentMode?: 'pick' | 'random';
  randomSpotClaims?: { label: string; buyerUsername: string }[];
  variants?: {
    id: string;
    label: string;
    priceUsd: number;
    quantityRemaining: number;
    soldCount?: number;
    isHot: boolean;
    status: string;
    buyerUsername: string | null;
    color?: string | null;
    sortOrder?: number;
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
  return fetchWebApiMobileWithSellerAuth(path, accessToken, init);
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
    imageUrl?: string;
    salesFormat?: 'auction' | 'buy_now' | 'variant_selection' | 'team_break';
    listingId?: string | null;
    quantity?: number | null;
    startingBidUsd?: number | null;
    reservePriceUsd?: number | null;
    priceUsd?: number | null;
    variants?: Array<{
      label: string;
      priceUsd: number;
      quantityInitial?: number;
      sortOrder?: number;
      color?: string;
      isHot?: boolean;
    }>;
    variantAssignmentMode?: 'pick' | 'random';
    sellerShippingProfileId?: string | null;
    shippingProfileId?: string | null;
  },
): Promise<string> {
  const body: Record<string, unknown> = {
    title: input.title.trim(),
    imageUrl: input.imageUrl?.trim() ?? '',
    listingId: input.listingId ?? null,
    quantity: input.quantity ?? 1,
    startingBidUsd: input.startingBidUsd ?? null,
    reservePriceUsd: input.reservePriceUsd ?? null,
    priceUsd: input.priceUsd ?? null,
  };
  if (input.salesFormat) {
    body.salesFormat = input.salesFormat;
  } else if (!input.listingId) {
    body.salesFormat = 'auction';
  }
  if (input.variantAssignmentMode) {
    body.variantAssignmentMode = input.variantAssignmentMode;
  }
  if (input.variants?.length) {
    body.variants = input.variants;
  }
  if (input.sellerShippingProfileId?.trim()) {
    body.sellerShippingProfileId = input.sellerShippingProfileId.trim();
  } else if (input.shippingProfileId?.trim()) {
    body.shippingProfileId = input.shippingProfileId.trim();
  }
  const res = await controlFetch(`/api/live-rooms/${encodeURIComponent(roomId)}/items`, accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  let j: unknown;
  try {
    j = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  const id = (j as { id?: string } | null)?.id?.trim();
  if (!id) throw new Error('Queue item saved but the server did not return an id. Pull to refresh.');
  return id;
}

export type LiveShopInventoryListing = {
  id: string;
  title: string;
  imageUrl: string;
  priceUsd: number | null;
  startingBidUsd: number | null;
  buyingFormat: string;
  status: string;
  inventoryChannel: 'marketplace' | 'live_show';
  alreadyInQueue: boolean;
  inventoryHeld: boolean;
  available: boolean;
};

export async function fetchLiveRoomShopInventory(
  accessToken: string,
  roomId: string,
): Promise<LiveShopInventoryListing[]> {
  const res = await controlFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/shop-inventory`,
    accessToken,
  );
  let j: { listings?: LiveShopInventoryListing[]; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  return Array.isArray(j.listings) ? j.listings : [];
}

export type PriorLiveRoomOption = {
  id: string;
  title: string;
  status: string;
};

export async function fetchPriorLiveRoomsForCopy(
  accessToken: string,
  currentRoomId: string,
): Promise<PriorLiveRoomOption[]> {
  const res = await controlFetch(`/api/live-rooms?mine=1&includeEnded=1&limit=40`, accessToken);
  let j: { rooms?: PriorLiveRoomOption[]; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  return (Array.isArray(j.rooms) ? j.rooms : []).filter((r) => r.id && r.id !== currentRoomId);
}

export async function importLiveRoomItemsFromRoom(
  accessToken: string,
  roomId: string,
  sourceRoomId: string,
): Promise<{ imported: number; skipped: number; sourceTitle?: string }> {
  const res = await controlFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/items/import-from-room`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ sourceRoomId }),
    },
  );
  let j: { imported?: number; skipped?: number; sourceTitle?: string; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  return {
    imported: typeof j.imported === 'number' ? j.imported : 0,
    skipped: typeof j.skipped === 'number' ? j.skipped : 0,
    sourceTitle: j.sourceTitle,
  };
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

export async function patchLiveItemVariants(
  accessToken: string,
  roomId: string,
  itemId: string,
  updates: Array<{ id: string; priceUsd?: number; isHot?: boolean }>,
): Promise<void> {
  const res = await controlFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/items/${encodeURIComponent(itemId)}/variants`,
    accessToken,
    { method: 'PATCH', body: JSON.stringify({ updates }) },
  );
  let j: unknown;
  try {
    j = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
}

/** Host team board: mark a PYT/PYD team sold and attach the buyer's username (no Stripe charge). */
export async function manualAssignLiveItemVariant(args: {
  accessToken: string;
  roomId: string;
  itemId: string;
  variantId: string;
  username: string;
  priceUsd?: number;
}): Promise<{ buyerUsername: string; label: string; totalUsd: number }> {
  const res = await controlFetch(
    `/api/live-rooms/${encodeURIComponent(args.roomId)}/items/${encodeURIComponent(args.itemId)}/variants/${encodeURIComponent(args.variantId)}/manual-assign`,
    args.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        username: args.username,
        ...(typeof args.priceUsd === 'number' ? { priceUsd: args.priceUsd } : {}),
      }),
    },
  );
  let j: { error?: string; buyerUsername?: string; label?: string; totalUsd?: number } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  return {
    buyerUsername: j.buyerUsername?.trim() || args.username.replace(/^@+/, ''),
    label: j.label?.trim() || 'Team',
    totalUsd: typeof j.totalUsd === 'number' ? j.totalUsd : 0,
  };
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
