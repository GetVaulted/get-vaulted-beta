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
