import type { LiveRoomType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * How long after a seller ends a live show a brand-new show from the same seller (same room type)
 * can still be marked as "continuing" the ended one.
 *
 * This is what lets a returning buyer's live-show shipping cap carry forward instead of resetting
 * to $0 when a seller ends a stream mid-break and starts a new stream to keep going. The seller is
 * shown a toggle to confirm this explicitly (see `GET /api/live-rooms/continuation-candidate`) —
 * a show that ended more than this long ago is never offered and can never be linked, even if the
 * seller (or a malicious client) tries to force it. See `sumSessionReservedShippingCentsTx` in
 * `live-commerce-shipping-settlement.ts` for where the carried-forward total is actually used.
 */
export const LIVE_ROOM_CONTINUATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export type LiveRoomContinuationCandidate = {
  id: string;
  title: string;
  endedAt: string;
};

/**
 * Finds the most recently ended live room from the same seller (same room type) within the
 * continuation window, if any — for showing the seller a "continue from this show?" toggle before
 * they go live. Does not link anything by itself; the seller must confirm.
 */
export async function findLiveRoomContinuationCandidate(args: {
  sellerId: string;
  roomType: LiveRoomType;
}): Promise<LiveRoomContinuationCandidate | null> {
  const candidate = await prisma.liveRoom.findFirst({
    where: {
      sellerId: args.sellerId,
      roomType: args.roomType,
      status: "ended",
      endedAt: { gte: new Date(Date.now() - LIVE_ROOM_CONTINUATION_WINDOW_MS) },
    },
    orderBy: { endedAt: "desc" },
    select: { id: true, title: true, endedAt: true },
  });
  if (!candidate || !candidate.endedAt) return null;
  return { id: candidate.id, title: candidate.title, endedAt: candidate.endedAt.toISOString() };
}

/**
 * Re-validates a seller-confirmed continuation link at room-creation time. Never trusts the
 * client's claimed `candidateId` at face value — a show past the continuation window (or belonging
 * to a different seller/roomType, or never actually ended) can never be used, no matter what the
 * client sends.
 */
export async function isEligibleLiveRoomContinuationCandidate(args: {
  sellerId: string;
  roomType: LiveRoomType;
  candidateId: string;
}): Promise<boolean> {
  const room = await prisma.liveRoom.findFirst({
    where: {
      id: args.candidateId,
      sellerId: args.sellerId,
      roomType: args.roomType,
      status: "ended",
      endedAt: { gte: new Date(Date.now() - LIVE_ROOM_CONTINUATION_WINDOW_MS) },
    },
    select: { id: true },
  });
  return room != null;
}
