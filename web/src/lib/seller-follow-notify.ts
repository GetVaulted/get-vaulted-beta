import { prisma } from "@/lib/prisma";

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

/** Notify followers when a seller goes live (call only on transition to `live`). */
export async function notifyFollowersSellerWentLive(sellerId: string, sellerUsername: string, liveRoomId: string) {
  const followerIds = await followerIdsForSeller(sellerId);
  if (followerIds.length === 0) return;
  const title = `@${sellerUsername} is live now`;
  const href = `/live/${encodeURIComponent(liveRoomId)}`;
  await prisma.notification.createMany({
    data: followerIds.map((userId) => ({
      userId,
      type: "seller_live",
      title,
      body: "Open their live room.",
      href,
    })),
  });
}

