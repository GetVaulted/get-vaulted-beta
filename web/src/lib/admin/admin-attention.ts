import { prisma } from "@/lib/prisma";

export type AttentionSeverity = "critical" | "warning" | "info";

export type AttentionItem = {
  key: string;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  count: number;
  href: string;
};

export type AttentionCounts = {
  payoutsNeedReview: number;
  stuckRefunds: number;
  escalatedRefunds: number;
  disputesOverdue: number;
  disputesDueSoon: number;
  unshippedOrders: number;
  sellerApplicationsPending: number;
  supportTicketsWaiting: number;
  reportsOpen: number;
  showsLiveNoVideo: number;
};

const ORDER: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Pure: turn raw counts into a ranked list. Zero-count items are dropped. */
export function buildAttentionItems(c: AttentionCounts): AttentionItem[] {
  const all: AttentionItem[] = [
    { key: "disputes_overdue", severity: "critical", title: "Disputes past their evidence deadline", detail: "Stripe may have already ruled. Check the outcome.", count: c.disputesOverdue, href: "/admin/disputes" },
    { key: "disputes_due_soon", severity: "critical", title: "Disputes with evidence due in 3 days", detail: "Submit evidence before the deadline or the dispute is lost.", count: c.disputesDueSoon, href: "/admin/disputes" },
    { key: "payouts_review", severity: "critical", title: "Payouts blocked or in manual review", detail: "Sellers are waiting on money. Open each order and release or fix it.", count: c.payoutsNeedReview, href: "/admin/payouts" },
    { key: "stuck_refunds", severity: "critical", title: "Refunds stuck processing for over an hour", detail: "Use Retry on the refund. It is safe to retry.", count: c.stuckRefunds, href: "/admin/refund-requests" },
    { key: "shows_no_video", severity: "critical", title: "Live shows with no video for 10+ minutes", detail: "The host started the show but no stream is arriving.", count: c.showsLiveNoVideo, href: "/admin/live-shows" },
    { key: "refunds_escalated", severity: "warning", title: "Refunds waiting for a support decision", detail: "A seller denied or the buyer escalated.", count: c.escalatedRefunds, href: "/admin/refund-requests" },
    { key: "unshipped_orders", severity: "warning", title: "Paid orders with no tracking after 5 days", detail: "Message the seller or fix the order.", count: c.unshippedOrders, href: "/admin/fulfillment" },
    { key: "seller_applications", severity: "warning", title: "Seller applications to review", detail: "Approve, ask for info, or reject.", count: c.sellerApplicationsPending, href: "/admin/seller-applications" },
    { key: "support_tickets", severity: "warning", title: "Support tickets waiting over 24 hours", detail: "Members are waiting on a reply.", count: c.supportTicketsWaiting, href: "/admin/support-tickets" },
    { key: "reports_open", severity: "info", title: "Open member reports", detail: "Review and resolve or dismiss.", count: c.reportsOpen, href: "/admin/reports" },
  ];
  return all.filter((i) => i.count > 0).sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export async function loadAttentionCounts(now = new Date()): Promise<AttentionCounts> {
  const t = now.getTime();
  const [
    payoutsNeedReview,
    stuckRefunds,
    escalatedRefunds,
    disputesOverdue,
    disputesDueSoon,
    unshippedOrders,
    sellerApplicationsPending,
    supportTicketsWaiting,
    reportsOpen,
    showsLiveNoVideo,
  ] = await Promise.all([
    prisma.order.count({ where: { payoutStatus: { in: ["blocked", "manual_review"] } } }),
    prisma.orderRefundRequest.count({ where: { status: "refund_processing", updatedAt: { lt: new Date(t - HOUR) } } }),
    prisma.orderRefundRequest.count({ where: { status: "escalated" } }),
    prisma.stripeDispute.count({
      where: { status: { in: ["needs_response", "warning_needs_response"] }, evidenceDueBy: { lt: now } },
    }),
    prisma.stripeDispute.count({
      where: {
        status: { in: ["needs_response", "warning_needs_response"] },
        evidenceDueBy: { gte: now, lt: new Date(t + 3 * DAY) },
      },
    }),
    prisma.order.count({
      where: { status: "paid", shippedAt: null, trackingNumber: null, paidAt: { lt: new Date(t - 5 * DAY) } },
    }),
    prisma.sellerApplication.count({ where: { status: { in: ["pending", "info_requested"] } } }),
    prisma.supportTicket.count({ where: { status: "submitted", createdAt: { lt: new Date(t - DAY) } } }),
    prisma.report.count({ where: { status: "open" } }),
    prisma.liveRoom.count({
      where: { status: "live", streamStartedAt: null, startedAt: { lt: new Date(t - 10 * 60_000) } },
    }),
  ]);
  return {
    payoutsNeedReview,
    stuckRefunds,
    escalatedRefunds,
    disputesOverdue,
    disputesDueSoon,
    unshippedOrders,
    sellerApplicationsPending,
    supportTicketsWaiting,
    reportsOpen,
    showsLiveNoVideo,
  };
}

export async function loadAttentionItems(now = new Date()): Promise<AttentionItem[]> {
  return buildAttentionItems(await loadAttentionCounts(now));
}
