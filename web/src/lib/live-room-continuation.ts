import type { LiveRoomType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * How long after a seller ends a live show a brand-new show from the same seller (same room type)
 * is still auto-linked as "continuing" the ended one.
 *
 * This is what makes a returning buyer's live-show shipping cap carry forward instead of resetting
 * to $0 when a seller ends a stream mid-break and starts a new stream to keep going — no seller
 * action required. See `sumSessionReservedShippingCentsTx` in `live-commerce-shipping-settlement.ts`
 * for where the carried-forward total is actually used.
 */
export const LIVE_ROOM_CONTINUATION_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Finds the most recently ended live room from the same seller (same room type) within the
 * continuation window, if any. Called only at room-creation time — the link, once set, is
 * permanent for that room.
 */
export async function findRecentEndedLiveRoomIdForContinuation(args: {
  sellerId: string;
  roomType: LiveRoomType;
}): Promise<string | null> {
  const candidate = await prisma.liveRoom.findFirst({
    where: {
      sellerId: args.sellerId,
      roomType: args.roomType,
      status: "ended",
      endedAt: { gte: new Date(Date.now() - LIVE_ROOM_CONTINUATION_WINDOW_MS) },
    },
    orderBy: { endedAt: "desc" },
    select: { id: true },
  });
  return candidate?.id ?? null;
}
