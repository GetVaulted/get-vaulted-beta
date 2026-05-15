import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { minNextBidUsd } from "@/lib/auction";
import { closeAuctionIfDuePrisma } from "@/lib/auction-close";
import { isListingPubliclyVisible } from "@/lib/listing-moderation";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);
  const session = await getServerSessionSafe();

  await closeAuctionIfDuePrisma(listingId);

  const row = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      sellerId: true,
      buyingFormat: true,
      status: true,
      startingBidUsd: true,
      currentBidUsd: true,
      priceUsd: true,
      auctionEndsAt: true,
      moderationRemovedAt: true,
    },
  });

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = session?.user?.id === row.sellerId;
  const isPublic = isListingPubliclyVisible(row);
  if (!isPublic && !isOwner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.buyingFormat !== "auction") {
    return NextResponse.json({ error: "Not an auction" }, { status: 400 });
  }

  const bids = await prisma.bid.findMany({
    where: { listingId },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { bidder: { select: { username: true } } },
  });

  const bidCount = await prisma.bid.count({ where: { listingId } });
  const currentHigh = row.currentBidUsd ?? row.startingBidUsd ?? row.priceUsd;
  const minNext = minNextBidUsd(currentHigh);
  const now = new Date();
  const auctionEnded =
    row.buyingFormat !== "auction" ||
    row.status === "sold" ||
    (row.auctionEndsAt != null && row.auctionEndsAt <= now);

  return NextResponse.json({
    bids: bids.map((b) => ({
      id: b.id,
      amountUsd: b.amountUsd,
      bidderUsername: b.bidder.username,
      createdAt: b.createdAt.toISOString(),
    })),
    bidCount,
    currentBidUsd: row.currentBidUsd,
    startingBidUsd: row.startingBidUsd ?? row.priceUsd,
    minNextBidUsd: minNext,
    auctionEndsAt: row.auctionEndsAt?.toISOString() ?? null,
    listingStatus: row.status,
    buyingFormat: row.buyingFormat,
    auctionEnded,
  });
}
