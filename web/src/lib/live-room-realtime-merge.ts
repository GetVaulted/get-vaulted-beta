import type { LiveRoomItemStatus } from "@/generated/prisma/client";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

/** Payload from `emitActiveItemChanged` / room broadcast. */
export type ActiveItemChangedPayload = {
  itemId?: string;
  roomVersion?: number;
  itemVersion?: number;
  biddingOpen?: boolean;
  auctionEndsAt?: string | null;
};

/** Payload from `emitBidPlaced` (extended with timer fields). */
export type BidPlacedPayload = {
  itemId?: string;
  amountUsd?: number;
  roomVersion?: number;
  itemVersion?: number;
  auctionEndsAt?: string | null;
  biddingOpen?: boolean;
  /** Session user who submitted this bid (legacy). */
  bidderId?: string;
  /** Current auction leader on the lot (may differ from `bidderId` with proxy bidding). */
  leadingBidderId?: string;
  leadingBidderUsername?: string | null;
  /** Canonical per-room auction sequence (when present, preferred over wall-clock ordering). */
  auctionSeq?: number;
};

export function mergeLiveRoomItemsForActiveItemEvent(
  items: LiveRoomItemDTO[],
  payload: ActiveItemChangedPayload,
): LiveRoomItemDTO[] {
  if (!payload.itemId) return items;
  const itemId = payload.itemId;
  return items.map((it) => {
    const isPromoted = it.id === itemId;
    const wasActive = it.status === "active";

    if (isPromoted) {
      const itemVersion =
        typeof payload.itemVersion === "number" ? Math.max(it.itemVersion, payload.itemVersion) : it.itemVersion;
      let biddingOpen = it.biddingOpen;
      let auctionEndsAt = it.auctionEndsAt;
      if (typeof payload.biddingOpen === "boolean") {
        biddingOpen = payload.biddingOpen;
      } else if (!wasActive) {
        biddingOpen = false;
        auctionEndsAt = null;
      }
      if (typeof payload.auctionEndsAt === "string") {
        auctionEndsAt = payload.auctionEndsAt;
      } else if (payload.auctionEndsAt === null) {
        auctionEndsAt = null;
      } else if (!wasActive) {
        auctionEndsAt = null;
      }
      return { ...it, status: "active" as LiveRoomItemStatus, itemVersion, biddingOpen, auctionEndsAt };
    }

    if (wasActive) {
      return {
        ...it,
        status: "queued" as LiveRoomItemStatus,
        biddingOpen: false,
        auctionEndsAt: null,
        itemVersion: it.itemVersion,
      };
    }

    return it;
  });
}

export function mergeLiveRoomItemsForBidPlaced(items: LiveRoomItemDTO[], payload: BidPlacedPayload): LiveRoomItemDTO[] {
  if (!payload.itemId || typeof payload.amountUsd !== "number") return items;
  const amountUsd = payload.amountUsd;
  const leaderId = payload.leadingBidderId ?? payload.bidderId;
  return items.map((it) => {
    if (it.id !== payload.itemId) return it;
    const iv =
      typeof payload.itemVersion === "number"
        ? Math.max(it.itemVersion, payload.itemVersion)
        : it.itemVersion;
    const prevBid = it.currentBidUsd ?? 0;
    const next: LiveRoomItemDTO = {
      ...it,
      currentBidUsd: Math.max(prevBid, amountUsd),
      itemVersion: iv,
      lastHighBidderId:
        typeof leaderId === "string" && leaderId.trim() ? leaderId.trim() : it.lastHighBidderId,
      lastHighBidderUsername:
        payload.leadingBidderUsername !== undefined ? payload.leadingBidderUsername : it.lastHighBidderUsername,
    };
    if (payload.auctionEndsAt !== undefined) {
      next.auctionEndsAt = payload.auctionEndsAt === null ? null : payload.auctionEndsAt;
    }
    if (typeof payload.biddingOpen === "boolean") {
      next.biddingOpen = payload.biddingOpen;
    }
    return next;
  });
}
