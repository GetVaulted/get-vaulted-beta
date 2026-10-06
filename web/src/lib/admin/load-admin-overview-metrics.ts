import { prisma } from "@/lib/prisma";
import { loadAdminFinanceSummary } from "@/lib/admin/admin-finance-aggregates";
import { countOrdersReadyForAdminBankPayout } from "@/lib/admin/orders-ready-for-bank-payout";
import { loadOnlinePresenceSummary, type OnlinePresenceSummary } from "@/lib/app-presence";

export type AdminOverviewMetrics = {
  liveActive: number;
  liveScheduled: number;
  openReports: number;
  openSupportTickets: number;
  pendingListings: number;
  flaggedListings: number;
  openOrders: number;
  activeLayaways: number;
  sellersPendingPayoutReview: number;
  ordersReadyForBankPayout: number;
  suspendedUsers: number;
  onlineNow: number;
  onlineByPlatform: OnlinePresenceSummary["onlineByPlatform"];
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
    openSupportTickets,
    pendingListings,
    flaggedListings,
    openOrders,
    activeLayaways,
    sellersPendingPayoutReview,
    ordersReadyForBankPayout,
    suspendedUsers,
    online,
    finance,
  ] = await Promise.all([
    prisma.liveRoom.count({ where: { status: "live" } }),
    prisma.liveRoom.count({ where: { status: "scheduled" } }),
    prisma.report.count({ where: { status: { in: ["open", "reviewing"] } } }),
    prisma.supportTicket.count({ where: { status: { in: ["submitted", "in_progress"] } } }),
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
    countOrdersReadyForAdminBankPayout(),
    prisma.user.count({ where: { suspendedAt: { not: null } } }),
    loadOnlinePresenceSummary(),
    loadAdminFinanceSummary(),
  ]);

  return {
    liveActive,
    liveScheduled,
    openReports,
    openSupportTickets,
    pendingListings,
    flaggedListings,
    openOrders,
    activeLayaways,
    sellersPendingPayoutReview,
    ordersReadyForBankPayout,
    suspendedUsers,
    onlineNow: online.onlineNow,
    onlineByPlatform: online.onlineByPlatform,
    finance: {
      gmvUsd: finance.gmvUsd,
      platformFeesUsd: finance.platformFeesUsd,
      pendingPayoutsUsd: finance.pendingPayoutsUsd,
    },
    updatedAt: new Date().toISOString(),
  };
}
