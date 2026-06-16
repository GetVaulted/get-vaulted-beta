import { prisma } from "@/lib/prisma";
import { loadAdminFinanceSummary } from "@/lib/admin/admin-finance-aggregates";

export type AdminOverviewMetrics = {
  liveActive: number;
  liveScheduled: number;
  openReports: number;
  pendingListings: number;
  flaggedListings: number;
  openOrders: number;
  activeLayaways: number;
  sellersPendingPayoutReview: number;
  suspendedUsers: number;
  finance: {
    gmvUsd: number | null;
    platformFeesUsd: number | null;
    pendingPayoutsUsd: number | null;
  };
  updatedAt: string;
};

export async function loadAdminOverviewMetrics(): Promise<AdminOverviewMetrics> {
  const [
    liveActive,
    liveScheduled,
    openReports,
    pendingListings,
    flaggedListings,
    openOrders,
    activeLayaways,
    sellersPendingPayoutReview,
    suspendedUsers,
    finance,
  ] = await Promise.all([
    prisma.liveRoom.count({ where: { status: "live" } }),
    prisma.liveRoom.count({ where: { status: "scheduled" } }),
    prisma.report.count({ where: { status: { in: ["open", "reviewing"] } } }),
    prisma.listing.count({
      where: { status: "active", moderationRemovedAt: null, adminReviewedAt: null },
    }),
    prisma.listing.count({ where: { moderationRemovedAt: { not: null } } }),
    prisma.order.count({ where: { status: { in: ["pending", "paid"] } } }),
    prisma.layaway.count({ where: { status: "active" } }),
    prisma.user.count({
      where: {
        OR: [
          { fastPayoutStatus: "pending_approval" },
          { instantPayoutApprovalStatus: "under_review" },
        ],
      },
    }),
    prisma.user.count({ where: { suspendedAt: { not: null } } }),
    loadAdminFinanceSummary(),
  ]);

  return {
    liveActive,
    liveScheduled,
    openReports,
    pendingListings,
    flaggedListings,
    openOrders,
    activeLayaways,
    sellersPendingPayoutReview,
    suspendedUsers,
    finance: {
      gmvUsd: finance.gmvUsd,
      platformFeesUsd: finance.platformFeesUsd,
      pendingPayoutsUsd: finance.pendingPayoutsUsd,
    },
    updatedAt: new Date().toISOString(),
  };
}
