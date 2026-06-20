import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveOptionalSellerFollowUserId } from "@/lib/resolve-seller-follow-auth";
import { resolveSellerFromApiParam } from "@/lib/resolve-seller-route-param";

export async function GET(req: Request, ctx: { params: Promise<{ sellerId: string }> }) {
  const { sellerId: raw } = await ctx.params;
  const seller = await resolveSellerFromApiParam(raw);
  if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });

  const viewerId = await resolveOptionalSellerFollowUserId(req);
  const followerCount = await prisma.sellerFollow.count({ where: { sellerId: seller.id } });

  if (!viewerId) {
    return NextResponse.json({
      following: false,
      followerCount,
      isSelf: false,
    });
  }

  const isSelf = viewerId === seller.id;
  const row = await prisma.sellerFollow.findUnique({
    where: {
      followerId_sellerId: { followerId: viewerId, sellerId: seller.id },
    },
    select: { id: true },
  });

  return NextResponse.json({
    following: Boolean(row),
    followerCount,
    isSelf,
  });
}
