import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.watchlistItem.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    // Defensive cap — no pagination UI yet; bounds worst case for a power user with a very
    // large watchlist (see performance audit 2026-07).
    take: 500,
    include: {
      listing: {
        include: {
          seller: { select: { username: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        },
      },
    },
  });

  return NextResponse.json({
    items: items.map((w) => {
      const l = w.listing;
      const isAuction = l.buyingFormat === "auction";
      const displayPrice = isAuction ? (l.currentBidUsd ?? l.startingBidUsd ?? l.priceUsd) : l.priceUsd;
      return {
        watchlistItemId: w.id,
        listingId: l.id,
        title: l.title,
        thumbUrl: l.images[0]?.url ?? null,
        priceUsd: displayPrice,
        buyingFormat: l.buyingFormat,
        sellerUsername: l.seller.username,
        status: l.status,
        savedAt: w.createdAt.toISOString(),
      };
    }),
  });
}
