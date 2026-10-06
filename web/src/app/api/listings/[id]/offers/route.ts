import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, sellerId: true, title: true },
  });
  if (!listing || listing.sellerId !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const offers = await prisma.offer.findMany({
    where: { listingId },
    orderBy: { createdAt: "desc" },
    // Defensive cap — no pagination UI yet (see performance audit 2026-07).
    take: 500,
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
