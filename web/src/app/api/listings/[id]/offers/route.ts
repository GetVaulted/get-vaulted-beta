import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, sellerId: true, title: true },
  });
  if (!listing || listing.sellerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const offers = await prisma.offer.findMany({
    where: { listingId },
    orderBy: { createdAt: "desc" },
    include: {
      buyer: { select: { username: true } },
    },
  });

  return NextResponse.json({
    listingTitle: listing.title,
    offers: offers.map((o) => ({
      id: o.id,
      buyerUsername: o.buyer.username,
      amountUsd: o.amountUsd,
      message: o.message,
      status: o.status,
      counterAmountUsd: o.counterAmountUsd,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
  });
}
