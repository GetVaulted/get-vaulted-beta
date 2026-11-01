import { NextResponse } from "next/server";
import { OrderPayoutStatus } from "@/generated/prisma/enums";
import { OPEN_DISPUTE_STATUSES, NEEDS_RESPONSE_STATUSES } from "@/lib/admin/admin-disputes";
import { findLinkedAccountsForUser } from "@/lib/admin/admin-linked-accounts";
import { FAILED_PAYMENT_LOCK_WINDOW_HOURS, loadRiskySalePayoutHold, HIGH_VALUE_PURCHASE_CENTS } from "@/lib/buyer-payment-risk";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

const UNPAID_PAYOUT_STATUSES: OrderPayoutStatus[] = [
  OrderPayoutStatus.pending,
  OrderPayoutStatus.held,
  OrderPayoutStatus.delivery_confirmed,
  OrderPayoutStatus.fast_payout_ready,
  OrderPayoutStatus.label_payout_ready,
  OrderPayoutStatus.instant_payout_ready,
  OrderPayoutStatus.manual_review,
];

export type AdminUserSummaryAlert = { tone: "warn" | "danger"; text: string; href?: string };

export type AdminUserSummary = {
  user: {
    id: string;
    username: string | null;
    name: string | null;
    email: string;
    emailVerified: boolean;
    phone: string | null;
    phoneVerified: boolean;
    role: string;
    createdAt: string;
    suspendedAt: string | null;
    isSeller: boolean;
    payoutRiskLevel: string;
    purchasesLocked: boolean;
    purchasesLockReason: string | null;
    sellerLocked: boolean;
    sellerLockReason: string | null;
  };
  buyer: { paidOrders: number; spentUsd: number };
  seller: { paidSales: number; soldUsd: number; unpaidSales: number; unpaidUsd: number; heldUsd: number; heldUntil: string | null };
  refunds: { count: number; ratePct: number | null };
  disputes: { open: number; lost: number; won: number; nextDueAt: string | null; openUsd: number };
  storeCreditUsd: number;
  failedPayments24h: number;
  linkedAccounts: number;
  recentOrders: Array<{
    id: string;
    role: "buyer" | "seller";
    title: string;
    otherParty: string | null;
    totalUsd: number;
    paymentStatus: string;
    fulfillmentStatus: string;
    payoutStatus: string;
    createdAt: string;
  }>;
  alerts: AdminUserSummaryAlert[];
};

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * One-call snapshot of a user for the admin search preview and the profile header: identity, money in/out,
 * disputes, credit, locks and risk signals, plus the things that need an admin's attention. Read-only.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const id = decodeURIComponent((await ctx.params).id);
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      emailVerified: true,
      phoneE164: true,
      phoneVerifiedAt: true,
      role: true,
      createdAt: true,
      suspendedAt: true,
      stripeAccountId: true,
      payoutRiskLevel: true,
      purchasesLockedAt: true,
      purchasesLockReason: true,
      sellerLockedAt: true,
      sellerLockReason: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const since24h = new Date(Date.now() - FAILED_PAYMENT_LOCK_WINDOW_HOURS * 60 * 60 * 1000);
  const [buyerAgg, sellerAgg, unpaid, refundCount, allOrderCount, myOrderIds, platformCredit, referralCredit, failed, recent, linked] =
    await Promise.all([
      prisma.order.aggregate({ where: { buyerId: id, paymentStatus: "paid" }, _count: true, _sum: { totalUsd: true } }),
      prisma.order.aggregate({ where: { sellerId: id, paymentStatus: "paid" }, _count: true, _sum: { totalUsd: true } }),
      prisma.order.findMany({
        where: { sellerId: id, paymentStatus: "paid", payoutStatus: { in: UNPAID_PAYOUT_STATUSES } },
        select: { id: true, totalUsd: true },
        take: 500,
      }),
      prisma.order.count({
        where: { OR: [{ buyerId: id }, { sellerId: id }], paymentStatus: { in: ["refunded", "chargeback"] } },
      }),
      prisma.order.count({
        where: { OR: [{ buyerId: id }, { sellerId: id }], paymentStatus: { in: ["paid", "refunded", "chargeback"] } },
      }),
      prisma.order.findMany({ where: { OR: [{ buyerId: id }, { sellerId: id }] }, select: { id: true }, take: 5000 }),
      prisma.platformCredit.aggregate({ where: { userId: id, status: "available" }, _sum: { amountUsd: true } }),
      prisma.referralCredit.aggregate({ where: { userId: id, status: "available" }, _sum: { amountUsd: true } }),
      prisma.order.count({ where: { buyerId: id, paymentStatus: "failed", updatedAt: { gte: since24h } } }),
      prisma.order.findMany({
        where: { OR: [{ buyerId: id }, { sellerId: id }] },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          buyerId: true,
          totalUsd: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          payoutStatus: true,
          createdAt: true,
          listing: { select: { title: true } },
          buyer: { select: { username: true } },
          seller: { select: { username: true } },
        },
      }),
      findLinkedAccountsForUser(id).catch(() => ({ userId: id, peers: [] })),
    ]);

  const disputes = myOrderIds.length
    ? await prisma.stripeDispute.findMany({
        where: { orderId: { in: myOrderIds.map((o) => o.id) } },
        select: { status: true, amountCents: true, evidenceDueBy: true },
      })
    : [];
  const openDisputes = disputes.filter((d) => OPEN_DISPUTE_STATUSES.includes(d.status));
  const needsResponse = openDisputes
    .filter((d) => NEEDS_RESPONSE_STATUSES.includes(d.status) && d.evidenceDueBy)
    .sort((a, b) => a.evidenceDueBy!.getTime() - b.evidenceDueBy!.getTime());

  // Only $250+ sales can be on the risky-sale hold, so only check those.
  const heldChecks = await Promise.all(
    unpaid
      .filter((o) => Math.round(o.totalUsd * 100) >= HIGH_VALUE_PURCHASE_CENTS)
      .slice(0, 25)
      .map(async (o) => ({ o, hold: await loadRiskySalePayoutHold(o.id).catch(() => null) })),
  );
  const held = heldChecks.filter((h) => h.hold?.held);
  const heldUsd = held.reduce((s, h) => s + h.o.totalUsd, 0);
  const heldUntil = held
    .map((h) => h.hold!.holdUntil)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const alerts: AdminUserSummaryAlert[] = [];
  if (user.suspendedAt) alerts.push({ tone: "danger", text: `Account suspended since ${day(user.suspendedAt)}` });
  if (user.purchasesLockedAt) {
    alerts.push({
      tone: "danger",
      text:
        user.purchasesLockReason === "auto_failed_payments"
          ? "Buying locked automatically after repeated failed payments — review before unlocking"
          : `Buying locked: ${user.purchasesLockReason ?? "no reason given"}`,
    });
  }
  if (user.sellerLockedAt) alerts.push({ tone: "danger", text: `Seller locked: ${user.sellerLockReason ?? "no reason given"}` });
  for (const d of needsResponse.slice(0, 3)) {
    alerts.push({
      tone: "warn",
      text: `Dispute needs a response: ${usd(d.amountCents / 100)} · due ${day(d.evidenceDueBy!)}`,
      href: "/admin/disputes",
    });
  }
  if (held.length) {
    alerts.push({
      tone: "warn",
      text: `${usd(heldUsd)} payout on 14-day fraud hold${heldUntil ? ` until ${day(heldUntil)}` : ""}`,
    });
  }
  if (failed >= 3 && !user.purchasesLockedAt) {
    alerts.push({ tone: "warn", text: `${failed} failed payments in the last ${FAILED_PAYMENT_LOCK_WINDOW_HOURS} hours` });
  }

  const summary: AdminUserSummary = {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified != null,
      phone: user.phoneE164,
      phoneVerified: user.phoneVerifiedAt != null,
      role: String(user.role),
      createdAt: user.createdAt.toISOString(),
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      isSeller: Boolean(user.stripeAccountId) || sellerAgg._count > 0,
      payoutRiskLevel: String(user.payoutRiskLevel),
      purchasesLocked: user.purchasesLockedAt != null,
      purchasesLockReason: user.purchasesLockReason,
      sellerLocked: user.sellerLockedAt != null,
      sellerLockReason: user.sellerLockReason,
    },
    buyer: { paidOrders: buyerAgg._count, spentUsd: buyerAgg._sum.totalUsd ?? 0 },
    seller: {
      paidSales: sellerAgg._count,
      soldUsd: sellerAgg._sum.totalUsd ?? 0,
      unpaidSales: unpaid.length,
      unpaidUsd: unpaid.reduce((s, o) => s + o.totalUsd, 0),
      heldUsd,
      heldUntil: heldUntil?.toISOString() ?? null,
    },
    refunds: { count: refundCount, ratePct: allOrderCount > 0 ? (refundCount / allOrderCount) * 100 : null },
    disputes: {
      open: openDisputes.length,
      lost: disputes.filter((d) => d.status === "lost").length,
      won: disputes.filter((d) => d.status === "won").length,
      nextDueAt: needsResponse[0]?.evidenceDueBy?.toISOString() ?? null,
      openUsd: openDisputes.reduce((s, d) => s + d.amountCents / 100, 0),
    },
    storeCreditUsd: (platformCredit._sum.amountUsd ?? 0) + (referralCredit._sum.amountUsd ?? 0),
    failedPayments24h: failed,
    linkedAccounts: linked.peers.length,
    recentOrders: recent.map((o) => {
      const role = o.buyerId === id ? ("buyer" as const) : ("seller" as const);
      return {
        id: o.id,
        role,
        title: o.listing?.title ?? "(item)",
        otherParty: role === "buyer" ? o.seller.username : o.buyer.username,
        totalUsd: o.totalUsd,
        paymentStatus: o.paymentStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        payoutStatus: String(o.payoutStatus),
        createdAt: o.createdAt.toISOString(),
      };
    }),
    alerts,
  };
  return NextResponse.json(summary);
}
