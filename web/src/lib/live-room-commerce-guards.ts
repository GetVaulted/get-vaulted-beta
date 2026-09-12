import { prisma } from "@/lib/prisma";
import {
  isLiveRoomBroadcastOnAir,
  isLiveRoomBroadcastPurchasable,
  type LiveRoomBroadcastGate,
} from "@/lib/live-room-broadcast-on-air";
import {
  LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR,
  LIVE_HOST_SELF_COMMERCE_ERROR,
  LIVE_MODERATOR_COMMERCE_ERROR,
  LIVE_STREAM_PAUSED_COMMERCE_ERROR,
  type LiveBuyerCommerceBlock,
} from "@/lib/live-room-commerce-messages";

export {
  LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR,
  LIVE_HOST_SELF_COMMERCE_ERROR,
  LIVE_MODERATOR_COMMERCE_ERROR,
  LIVE_STREAM_PAUSED_COMMERCE_ERROR,
  type LiveBuyerCommerceBlock,
} from "@/lib/live-room-commerce-messages";

/** Auction/bid gates vs shop/Buy Now gates. Host pause only blocks auctions. */
export type LiveBroadcastCommerceMode = "auction" | "purchase";

/**
 * PYT / PYD / break-spot checkout is intentionally open while the show is still
 * `scheduled` (pre-sale before Go Live) and while `live`. Auctions/tips stay live-only.
 */
export function isLiveRoomOpenForSpotPurchase(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "live" || s === "scheduled";
}

/**
 * Host off-platform Mark sold / Supp sold: pre-sale before Go Live (scheduled),
 * while live, or after the show ends (next-day settlement). Mirrors
 * `isRoomOpenForHostTeamBoardEdit` so a host can pre-sell supps against a break
 * roster before the room ever goes live, same as they can retire/restore spots.
 */
export function isRoomOpenForHostOffPlatformMarkSold(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "live" || s === "scheduled" || s === "ended";
}

/**
 * Host team board retire / restore: prep before go-live, during the show, or
 * post-show cleanup. Buyer purchase stays gated separately.
 */
export function isRoomOpenForHostTeamBoardEdit(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "live" || s === "scheduled" || s === "ended";
}

/**
 * Blocks buyer commerce when the host broadcast is offline.
 * `auction` also blocks while the host is paused; `purchase` (Buy Now / spots / shop) stays open.
 */
export function getLiveRoomBroadcastCommerceBlock(
  room: LiveRoomBroadcastGate,
  mode: LiveBroadcastCommerceMode = "auction",
): LiveBuyerCommerceBlock | null {
  if (room.status !== "live") return null;

  if (mode === "purchase") {
    if (isLiveRoomBroadcastPurchasable(room)) return null;
    return {
      status: 409,
      error: LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR,
      code: "LIVE_BROADCAST_OFFLINE",
    };
  }

  if (isLiveRoomBroadcastOnAir(room)) return null;
  if (room.streamPaused === true) {
    return {
      status: 409,
      error: LIVE_STREAM_PAUSED_COMMERCE_ERROR,
      code: "LIVE_STREAM_PAUSED",
    };
  }
  return {
    status: 409,
    error: LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR,
    code: "LIVE_BROADCAST_OFFLINE",
  };
}

/** Blocks hosts and assigned room moderators from bidding or buying in the show. */
export async function getLiveBuyerCommerceBlock(args: {
  liveRoomId: string;
  userId: string;
}): Promise<LiveBuyerCommerceBlock | null> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: { sellerId: true },
  });
  if (!room) {
    return { status: 404, error: "Room not found.", code: "ROOM_NOT_FOUND" };
  }

  if (room.sellerId === args.userId) {
    return {
      status: 400,
      error: LIVE_HOST_SELF_COMMERCE_ERROR,
      code: "LIVE_HOST_SELF_COMMERCE",
    };
  }

  const mod = await prisma.liveRoomModerator.findFirst({
    where: { liveRoomId: args.liveRoomId, userId: args.userId, revokedAt: null },
    select: { id: true },
  });
  if (mod) {
    return {
      status: 403,
      error: LIVE_MODERATOR_COMMERCE_ERROR,
      code: "LIVE_MODERATOR_COMMERCE",
    };
  }

  return null;
}
