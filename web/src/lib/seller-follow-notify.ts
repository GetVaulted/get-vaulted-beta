import { claimFollowerNotifySlot, releaseFollowerNotifySlot } from "@/lib/seller-follower-notify-limit";
import { prisma } from "@/lib/prisma";
import { parseLiveRoomDiscoveryVisibility } from "@/lib/live-room-public-discovery";

async function followerIdsForSeller(sellerId: string): Promise<string[]> {
  const rows = await prisma.sellerFollow.findMany({
    where: { sellerId },
    select: { followerId: true },
    // Defensive cap — a viral seller's follower count could otherwise be unbounded
    // (performance audit 2026-07).
    take: 20000,
  });
  return rows.map((r) => r.followerId);
}

/**
 * Notify followers when a seller goes live (call only on transition to `live`).
 * Private (unlisted) shows never blast followers — those must be shared intentionally.
 */
export async function notifyFollowersSellerWentLive(sellerId: string, sellerUsername: string, liveRoomId: string) {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { discoveryVisibility: true },
  });
  if (!room) return;
  if (parseLiveRoomDiscoveryVisibility(room) === "private") return;

  const followerIds = await followerIdsForSeller(sellerId);
  if (followerIds.length === 0) return;
  // Strict limit: one follower-wide notification per seller per hour. If the seller already
  // notified their followers within the hour (share sheet or an earlier go-live), stay quiet.
  const slot = await claimFollowerNotifySlot(prisma, sellerId);
  if (!slot.ok) return;
  const title = `@${sellerUsername} is live now`;
  const href = `/live/${encodeURIComponent(liveRoomId)}`;
  try {
    await prisma.notification.createMany({
      data: followerIds.map((userId) => ({
        userId,
        type: "seller_live",
        title,
        body: "Open their live room.",
        href,
      })),
    });
  } catch (e) {
    await releaseFollowerNotifySlot(prisma, sellerId, slot);
    throw e;
  }
}

