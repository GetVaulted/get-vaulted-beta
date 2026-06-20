import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

/** Followers and following lists for the signed-in account (web session or mobile Bearer). */
export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const userId = auth.userId;

  const [followingRows, followerRows] = await Promise.all([
    prisma.sellerFollow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: "desc" },
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
    following: followingRows.map((row) => ({
      userId: row.seller.id,
      username: row.seller.username,
      image: row.seller.image,
      followedAt: row.createdAt.toISOString(),
    })),
    followers: followerRows.map((row) => ({
      userId: row.follower.id,
      username: row.follower.username,
      image: row.follower.image,
      followedAt: row.createdAt.toISOString(),
    })),
  });
}
