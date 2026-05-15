import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSellerFromApiParam } from "@/lib/resolve-seller-route-param";

export async function GET(_req: Request, ctx: { params: Promise<{ sellerId: string }> }) {
  const { sellerId: raw } = await ctx.params;
  const seller = await resolveSellerFromApiParam(raw);
  if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });

  const session = await getServerSessionSafe();
  const followerCount = await prisma.sellerFollow.count({ where: { sellerId: seller.id } });

  if (!session?.user?.id) {
    return NextResponse.json({
      following: false,
      followerCount,
      isSelf: false,
    });
  }

  const isSelf = session.user.id === seller.id;
  const row = await prisma.sellerFollow.findUnique({
    where: {
      followerId_sellerId: { followerId: session.user.id, sellerId: seller.id },
    },
    select: { id: true },
  });

  return NextResponse.json({
    following: Boolean(row),
    followerCount,
    isSelf,
  });
}
