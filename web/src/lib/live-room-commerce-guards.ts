import { prisma } from "@/lib/prisma";
import {
  LIVE_HOST_SELF_COMMERCE_ERROR,
  LIVE_MODERATOR_COMMERCE_ERROR,
  type LiveBuyerCommerceBlock,
} from "@/lib/live-room-commerce-messages";

export {
  LIVE_HOST_SELF_COMMERCE_ERROR,
  LIVE_MODERATOR_COMMERCE_ERROR,
  type LiveBuyerCommerceBlock,
} from "@/lib/live-room-commerce-messages";

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
