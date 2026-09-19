import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSellerFollowUserId } from "@/lib/resolve-seller-follow-auth";
import { resolveSellerFromApiParam } from "@/lib/resolve-seller-route-param";
import { createNotification } from "@/lib/notifications";
import { isUserBlocked, viewerCanSeeUser } from "@/lib/user-block";

export async function POST(req: Request, ctx: { params: Promise<{ sellerId: string }> }) {
  const auth = await requireSellerFollowUserId(req);
  if (auth instanceof NextResponse) return auth;
  const session = auth;

  const { sellerId: raw } = await ctx.params;
  const seller = await resolveSellerFromApiParam(raw);
  if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });

  if (seller.id === session.userId) {
    return NextResponse.json({ error: "You cannot follow yourself." }, { status: 400 });
  }

  if (!(await viewerCanSeeUser(prisma, session.userId, seller.id))) {
    return NextResponse.json({ error: "Seller not found." }, { status: 404 });
  }
  if (await isUserBlocked(prisma, session.userId, seller.id)) {
    return NextResponse.json({ error: "You cannot follow this user." }, { status: 403 });
  }

  try {
    await prisma.sellerFollow.create({
      data: { followerId: session.userId, sellerId: seller.id },
    });
  } catch {
    return NextResponse.json({ error: "Already following." }, { status: 409 });
  }

  const follower = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { username: true },
  });
  if (follower?.username) {
    await createNotification(prisma, {
      userId: seller.id,
      type: "new_follower",
      title: "New follower",
      body: `@${follower.username} started following you.`,
      href: `/seller/${encodeURIComponent(follower.username)}`,
    });
  }

  return NextResponse.json({ ok: true, following: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ sellerId: string }> }) {
  const auth = await requireSellerFollowUserId(req);
  if (auth instanceof NextResponse) return auth;
  const session = auth;

  const { sellerId: raw } = await ctx.params;
  const seller = await resolveSellerFromApiParam(raw);
  if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });

  await prisma.sellerFollow.deleteMany({
    where: { followerId: session.userId, sellerId: seller.id },
  });

  return NextResponse.json({ ok: true, following: false });
}
