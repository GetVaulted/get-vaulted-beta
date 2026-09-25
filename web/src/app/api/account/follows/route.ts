import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { listHiddenPeerIdsForViewer } from "@/lib/user-block";

/** Followers and following lists for the signed-in account (web session or mobile Bearer). */
export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const userId = auth.userId;
  const hiddenIds = await listHiddenPeerIdsForViewer(prisma, userId);
  const hiddenSet = new Set(hiddenIds);

  const [followingRows, followerRows] = await Promise.all([
    prisma.sellerFollow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: "desc" },
      // Defensive cap — no pagination UI yet (see performance audit 2026-07).
      take: 1000,
      include: {
        seller: {
          select: {
            id: true,
            username: true,
            image: true,
          },
        },
      },
    }),
    prisma.sellerFollow.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: "desc" },
      // Defensive cap — a popular seller's follower count could otherwise be unbounded.
      take: 1000,
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            image: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    following: followingRows
      .filter((row) => !hiddenSet.has(row.seller.id))
      .map((row) => ({
        userId: row.seller.id,
        username: row.seller.username,
        image: row.seller.image,
        followedAt: row.createdAt.toISOString(),
      })),
    followers: followerRows
      .filter((row) => !hiddenSet.has(row.follower.id))
      .map((row) => ({
        userId: row.follower.id,
        username: row.follower.username,
        image: row.follower.image,
        followedAt: row.createdAt.toISOString(),
      })),
  });
}
