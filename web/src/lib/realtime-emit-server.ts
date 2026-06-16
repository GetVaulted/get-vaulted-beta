import { prisma } from "@/lib/prisma";
import { loadMentionsForSource } from "@/lib/mentions/load-message-mentions";
import { serializeLiveRoomMessage } from "@/lib/live-room-serialize";
import { broadcastRealtimeEvent, broadcastRealtimeEventOnce } from "@/lib/supabase-realtime-broadcast";
import { LIVE_DISCOVERY_CHANNEL, LIVE_DISCOVERY_EVENT } from "@/lib/live-discovery-realtime";
import { listingBidsChannel, roomChannel, RT_EVENT, RT_EVENT_ALIASES, userNotificationsChannel } from "@/lib/realtime-channels";

function buildRoomBroadcastEnriched(liveRoomId: string, payload: Record<string, unknown>) {
  const serverNowMs = Date.now();
  return {
    emittedAt: new Date().toISOString(),
    eventId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    roomId: liveRoomId,
    liveRoomId,
    ...payload,
    serverNowMs,
  };
}

function emitRoomEventWithAliases(liveRoomId: string, event: string, payload: Record<string, unknown>) {
  const enriched = buildRoomBroadcastEnriched(liveRoomId, payload);
  broadcastRealtimeEvent(roomChannel(liveRoomId), event, enriched);
  const aliasEntries = Object.entries(RT_EVENT).find(([, v]) => v === event);
  if (!aliasEntries) return;
  const key = aliasEntries[0] as keyof typeof RT_EVENT_ALIASES;
  for (const alias of RT_EVENT_ALIASES[key] ?? []) {
    broadcastRealtimeEvent(roomChannel(liveRoomId), alias, enriched);
  }
}

/** Same payload as `emitRoomEventWithAliases`, but awaits delivery (host start-bidding UX; cached channel = low ms). */
async function emitRoomEventWithAliasesAwait(liveRoomId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  const enriched = buildRoomBroadcastEnriched(liveRoomId, payload);
  const ch = roomChannel(liveRoomId);
  await broadcastRealtimeEventOnce(ch, event, enriched);
  const aliasEntries = Object.entries(RT_EVENT).find(([, v]) => v === event);
  if (!aliasEntries) return;
  const key = aliasEntries[0] as keyof typeof RT_EVENT_ALIASES;
  for (const alias of RT_EVENT_ALIASES[key] ?? []) {
    await broadcastRealtimeEventOnce(ch, alias, enriched);
  }
}

export async function emitLiveRoomMessageById(messageId: string): Promise<void> {
  const row = await prisma.liveRoomMessage.findUnique({
    where: { id: messageId },
    include: { sender: { select: { username: true, image: true } } },
  });
  if (!row) return;
  const mentions = await loadMentionsForSource("live_room_message", row.id);
  const dto = serializeLiveRoomMessage(row, mentions);
  emitRoomEventWithAliases(row.liveRoomId, RT_EVENT.chatMessage, { message: dto });
}

export function emitLiveRoomMessagesRefetch(liveRoomId: string): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.messagesRefresh, {});
}

export function emitBreakSpotsChanged(liveRoomId: string): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.breakSpots, {});
}

export function emitLiveRoomQueueItemsChanged(liveRoomId: string): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.queueItems, { liveRoomId });
}

export function emitVariantPurchased(
  liveRoomId: string,
  payload: {
    itemId: string;
    variantId: string;
    purchaseId: string;
    label: string;
    buyerUsername: string;
    itemVersion: number;
  },
): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.variantPurchased, payload);
}

export function emitTeamBreakReady(
  liveRoomId: string,
  payload: { itemId: string; itemVersion: number },
): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.teamBreakReady, payload);
}

export function emitTeamBreakBegan(
  liveRoomId: string,
  payload: { itemId: string; itemVersion: number },
): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.teamBreakBegan, payload);
}

export function emitTeamBoardChanged(liveRoomId: string): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.teamBoard, { liveRoomId });
}

export function emitListingBidPlaced(listingId: string, liveRoomId?: string | null): void {
  broadcastRealtimeEvent(listingBidsChannel(listingId), RT_EVENT.listingBid, { listingId });
  if (liveRoomId) {
    emitRoomEventWithAliases(liveRoomId, RT_EVENT.listingBid, { listingId });
  }
}

export function emitBidPlaced(opts: {
  liveRoomId: string;
  itemId: string;
  amountUsd: number;
  bidderId: string;
  roomVersion?: number;
  itemVersion?: number;
  listingId?: string | null;
  /** Lets clients update the countdown in the same broadcast as the bid (sub‑second UX). */
  auctionEndsAt?: string | null;
  biddingOpen?: boolean;
  /** Current lot leader (defaults to `bidderId` when omitted). Proxy bids may differ from `bidderId`. */
  leadingBidderId?: string;
  leadingBidderUsername?: string | null;
  /** Monotonic per-room sequence from `LiveAuctionEvent.seq` (canonical ordering). */
  auctionSeq?: number;
}): void {
  emitRoomEventWithAliases(opts.liveRoomId, RT_EVENT.bidPlaced, opts);
  if (opts.listingId) emitListingBidPlaced(opts.listingId, opts.liveRoomId);
}

/** Await room + listing realtime so other viewers are not gated on HTTP snapshot latency. */
export async function emitBidPlacedAwait(opts: {
  liveRoomId: string;
  itemId: string;
  amountUsd: number;
  bidderId: string;
  roomVersion?: number;
  itemVersion?: number;
  listingId?: string | null;
  auctionEndsAt?: string | null;
  biddingOpen?: boolean;
  leadingBidderId?: string;
  leadingBidderUsername?: string | null;
  auctionSeq?: number;
}): Promise<void> {
  const payload: Record<string, unknown> = { ...opts };
  await emitRoomEventWithAliasesAwait(opts.liveRoomId, RT_EVENT.bidPlaced, payload);
  if (opts.listingId) {
    await Promise.all([
      broadcastRealtimeEventOnce(listingBidsChannel(opts.listingId), RT_EVENT.listingBid, { listingId: opts.listingId }),
      emitRoomEventWithAliasesAwait(opts.liveRoomId, RT_EVENT.listingBid, { listingId: opts.listingId }),
    ]);
  }
}

export function emitAuctionStarted(liveRoomId: string, roomVersion?: number): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.auctionStarted, { roomVersion });
}

export function emitAuctionEnded(liveRoomId: string, roomVersion?: number): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.auctionEnded, { roomVersion });
}

export function emitActiveItemChanged(
  liveRoomId: string,
  itemId: string,
  opts?: {
    roomVersion?: number;
    itemVersion?: number;
    biddingOpen?: boolean;
    auctionEndsAt?: string | null;
  },
): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.activeItemChanged, {
    itemId,
    roomVersion: opts?.roomVersion,
    itemVersion: opts?.itemVersion,
    ...(typeof opts?.biddingOpen === "boolean" ? { biddingOpen: opts.biddingOpen } : {}),
    ...(opts != null && "auctionEndsAt" in opts ? { auctionEndsAt: opts.auctionEndsAt } : {}),
  });
}

/** Await Supabase broadcast so buyers receive `active_item_changed` before the PATCH response completes. */
export async function emitActiveItemChangedAwait(
  liveRoomId: string,
  itemId: string,
  opts?: {
    roomVersion?: number;
    itemVersion?: number;
    biddingOpen?: boolean;
    auctionEndsAt?: string | null;
  },
): Promise<void> {
  await emitRoomEventWithAliasesAwait(liveRoomId, RT_EVENT.activeItemChanged, {
    itemId,
    roomVersion: opts?.roomVersion,
    itemVersion: opts?.itemVersion,
    ...(typeof opts?.biddingOpen === "boolean" ? { biddingOpen: opts.biddingOpen } : {}),
    ...(opts != null && "auctionEndsAt" in opts ? { auctionEndsAt: opts.auctionEndsAt } : {}),
  });
}

export type PurchaseCompletedEmitOpts = {
  roomVersion?: number;
  itemVersion?: number;
  winnerUsername?: string | null;
  winnerId?: string | null;
  winningAmountUsd?: number | null;
  orderId?: string | null;
  /** paid | pending | payment_failed | requires_action */
  paymentStatus?: string | null;
  /** Active lot closed with zero bids — show no-winner UX (not a sale). */
  noBids?: boolean;
};

export function emitPurchaseCompleted(
  liveRoomId: string,
  itemId: string,
  opts?: PurchaseCompletedEmitOpts,
): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.purchaseCompleted, {
    itemId,
    roomVersion: opts?.roomVersion,
    itemVersion: opts?.itemVersion,
    winnerUsername: opts?.winnerUsername ?? null,
    winnerId: opts?.winnerId ?? null,
    winningAmountUsd: opts?.winningAmountUsd ?? null,
    orderId: opts?.orderId ?? null,
    paymentStatus: opts?.paymentStatus ?? null,
    noBids: opts?.noBids === true,
  });
}

export function emitLiveRoomPaymentFailed(
  liveRoomId: string,
  payload: {
    failureId: string;
    buyerId: string;
    buyerUsername?: string | null;
    amountUsd: number;
    itemTitle?: string | null;
    liveRoomItemId?: string | null;
    orderId?: string | null;
    kind?: string;
    failureReason?: string | null;
  },
): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.paymentFailed, payload);
}

export function emitLiveRoomPaymentRecovered(
  liveRoomId: string,
  payload: {
    failureId: string;
    buyerId: string;
    buyerUsername?: string | null;
    amountUsd?: number | null;
    itemTitle?: string | null;
    orderId?: string | null;
  },
): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.paymentRecovered, payload);
}

export function emitUserNotificationCreated(userId: string): void {
  broadcastRealtimeEvent(userNotificationsChannel(userId), RT_EVENT.notification, {});
}

/** Buyer-safe payload only (no ingest, keys, or ARNs). */
export function emitStreamStatusChanged(
  liveRoomId: string,
  payload: { streamHealth: string; roomVersion?: number; lastStatusSyncAt?: string },
): void {
  emitRoomEventWithAliases(liveRoomId, RT_EVENT.streamStatus, {
    streamHealth: payload.streamHealth,
    roomVersion: payload.roomVersion,
    lastStatusSyncAt: payload.lastStatusSyncAt,
  });
}

/** Public live directory changed (room scheduled, updated, went live, or ended). */
export function emitLiveDiscoveryChanged(payload?: {
  roomId?: string;
  status?: string;
  reason?: "created" | "updated" | "started" | "ended" | "cancelled";
}): void {
  broadcastRealtimeEvent(LIVE_DISCOVERY_CHANNEL, LIVE_DISCOVERY_EVENT, {
    emittedAt: new Date().toISOString(),
    ...payload,
  });
}
