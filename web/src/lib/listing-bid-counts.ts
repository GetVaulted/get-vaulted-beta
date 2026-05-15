import { prisma } from "@/lib/prisma";

/** One `groupBy` query — use for published grids to avoid N+1 bid counts. */
export async function auctionBidCountsByListingIds(listingIds: string[]): Promise<Map<string, number>> {
  if (listingIds.length === 0) return new Map();
  const rows = await prisma.bid.groupBy({
    by: ["listingId"],
    where: { listingId: { in: listingIds } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.listingId, r._count._all]));
}
