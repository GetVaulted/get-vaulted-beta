import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const [
    pendingReview,
    flaggedRemoved,
    vaultVerified,
    draftListings,
    activeUnreviewed,
    categories,
  ] = await Promise.all([
    prisma.listing.count({
      where: { status: "active", moderationRemovedAt: null, adminReviewedAt: null },
    }),
    prisma.listing.count({ where: { moderationRemovedAt: { not: null } } }),
    prisma.listing.count({ where: { vaultPick: true, moderationRemovedAt: null } }),
    prisma.listing.count({ where: { status: "draft" } }),
    prisma.listing.count({ where: { status: "active", adminReviewedAt: { not: null } } }),
    prisma.listing.groupBy({
      by: ["category"],
      where: { status: "active", moderationRemovedAt: null },
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 12,
    }),
  ]);

  // Price anomaly: active listings priced > 10× category median (rough heuristic).
  const categoryMedians = await Promise.all(
    categories.slice(0, 8).map(async (c) => {
      const prices = await prisma.listing.findMany({
        where: { category: c.category, status: "active", moderationRemovedAt: null },
        select: { priceUsd: true },
        take: 200,
      });
      const sorted = prices.map((p) => p.priceUsd).sort((a, b) => a - b);
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
      const anomalies = await prisma.listing.count({
        where: {
          category: c.category,
          status: "active",
          moderationRemovedAt: null,
          priceUsd: { gt: Math.max(median * 10, 25_000) },
        },
      });
      return { category: c.category, listingCount: c._count._all, medianPriceUsd: median, anomalyCount: anomalies };
    }),
  );

  return NextResponse.json({
    pendingReview,
    flaggedRemoved,
    vaultVerified,
    draftListings,
    reviewedActive: activeUnreviewed,
    categoryReview: categoryMedians,
    priceAnomalyReview: categoryMedians.reduce((sum, c) => sum + c.anomalyCount, 0),
    note: "Price anomaly uses category median heuristic — TODO: dedicated anomaly scoring service.",
  });
}
