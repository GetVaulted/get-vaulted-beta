import type { PrismaClient } from "@/generated/prisma/client";
import { summaryFromDistribution, type ReviewSummary } from "@/lib/seller-reviews";

export type PublicSellerReview = {
  id: string;
  rating: number;
  body: string;
  tags: string[];
  createdAt: string;
  buyer: { username: string; image: string | null };
  itemTitle: string | null;
};

const visible = (sellerId: string) => ({ sellerId, hiddenAt: null });

export async function loadSellerReviewSummary(
  db: Pick<PrismaClient, "sellerReview">,
  sellerId: string,
): Promise<ReviewSummary> {
  const groups = await db.sellerReview.groupBy({
    by: ["rating"],
    where: visible(sellerId),
    _count: { _all: true },
  });
  const counts: Record<number, number> = {};
  for (const g of groups) counts[g.rating] = g._count._all;
  return summaryFromDistribution(counts);
}

export async function loadSellerReviews(
  db: Pick<PrismaClient, "sellerReview">,
  sellerId: string,
  opts: { take: number; skip?: number },
): Promise<PublicSellerReview[]> {
  const rows = await db.sellerReview.findMany({
    where: visible(sellerId),
    orderBy: { createdAt: "desc" },
    take: opts.take,
    skip: opts.skip ?? 0,
    select: {
      id: true,
      rating: true,
      body: true,
      tags: true,
      createdAt: true,
      buyer: { select: { username: true, image: true } },
      order: { select: { listing: { select: { title: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    tags: r.tags,
    createdAt: r.createdAt.toISOString(),
    buyer: { username: r.buyer.username, image: r.buyer.image },
    itemTitle: r.order.listing.title,
  }));
}
