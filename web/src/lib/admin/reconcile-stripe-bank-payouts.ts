import type { Prisma } from "@/generated/prisma/client";
import { OrderPayoutStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { orderItemSaleBasisUsd } from "@/lib/referral-credit-payout";
import {
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder,
} from "@/lib/seller-payout-estimate";
import { isStripeBankPayoutId } from "@/services/payout/stripe-seller-payout";

const READY_STATUSES: OrderPayoutStatus[] = [
  OrderPayoutStatus.fast_payout_ready,
  OrderPayoutStatus.label_payout_ready,
  OrderPayoutStatus.instant_payout_ready,
];

/** True when Connect bank payout (or zero-net sentinel) already recorded on the order. */
export function orderAlreadyHasBankPayoutRecord(processorTransferId: string | null | undefined): boolean {
  const id = processorTransferId?.trim() ?? "";
  if (!id) return false;
  if (isStripeBankPayoutId(id)) return true;
  if (id.startsWith("zero-net:")) return true;
  if (id.startsWith("bulk-bank:")) return true;
  if (id.startsWith("manual-bank-paid:")) return true;
  return false;
}

/**
 * Prisma filter: exclude orders that already have a bank payout id on file.
 * Ready queue must not show sellers who were paid (Dashboard / partial write / prior Push).
 */
export const adminBankPayoutNotAlreadyPaidWhere: Prisma.OrderWhereInput = {
  OR: [
    { processorTransferId: null },
    {
      AND: [
        { NOT: { processorTransferId: { startsWith: "po_" } } },
        { NOT: { processorTransferId: { startsWith: "zero-net:" } } },
        { NOT: { processorTransferId: { startsWith: "bulk-bank:" } } },
        { NOT: { processorTransferId: { startsWith: "manual-bank-paid:" } } },
      ],
    },
  ],
};

/** Pure helper: Dashboard bulk payout emptied Connect and covers the ready queue. */
export function connectBulkPayoutCoversReadyQueue(args: {
  availableUsdCents: number;
  pendingUsdCents: number;
  paidPayoutUsdCents: number;
  estimatedReadyNetUsdCents: number;
  /** Allow estimate drift vs Dashboard totals (fees / rounding). Default 10%. */
  coverageRatio?: number;
}): boolean {
  const ratio = args.coverageRatio ?? 0.9;
  if (args.estimatedReadyNetUsdCents < 1) return false;
  if (args.availableUsdCents > 100) return false; // > $1 still sitting on Connect
  if (args.pendingUsdCents > 100) return false;
  if (args.paidPayoutUsdCents < 1) return false;
  return args.paidPayoutUsdCents >= Math.floor(args.estimatedReadyNetUsdCents * ratio);
}

/**
 * Destination charges already put seller funds on Connect at payment time.
 * Admin "Push payout" only moves Connect → bank. So ready-queue net cannot exceed
 * what's still on Connect (available + pending). Anything above that was already banked
 * (Dashboard bulk / prior Push) — clear oldest ready orders first (FIFO).
 */
export function allocateOrdersAlreadyBankPaidByConnectShortfall(args: {
  orders: Array<{ id: string; estimatedNetUsdCents: number; sortAtMs: number }>;
  availableUsdCents: number;
  pendingUsdCents: number;
  /** Slack for estimate drift vs Stripe balances. Default $5. */
  slackUsdCents?: number;
}): { markPaidIds: string[]; keepReadyIds: string[] } {
  const sorted = [...args.orders].sort((a, b) => {
    if (a.sortAtMs !== b.sortAtMs) return a.sortAtMs - b.sortAtMs;
    return a.id.localeCompare(b.id);
  });
  const onConnect =
    Math.max(0, args.availableUsdCents) + Math.max(0, args.pendingUsdCents);
  const slack = Math.max(0, args.slackUsdCents ?? 500);
  const readyNet = sorted.reduce((sum, o) => sum + Math.max(0, o.estimatedNetUsdCents), 0);
  let shortfall = readyNet - onConnect - slack;
  if (shortfall <= 0) {
    return { markPaidIds: [], keepReadyIds: sorted.map((o) => o.id) };
  }

  const markPaidIds: string[] = [];
  const keepReadyIds: string[] = [];
  for (const o of sorted) {
    if (shortfall <= 0) {
      keepReadyIds.push(o.id);
      continue;
    }
    markPaidIds.push(o.id);
    shortfall -= Math.max(0, o.estimatedNetUsdCents);
  }
  return { markPaidIds, keepReadyIds };
}

/**
 * Flip ready-status orders that already have `po_` / `zero-net:` to `paid_out`.
 * Heals the split-write gap (payout created, status never updated).
 */
export async function healOrdersWithExistingBankPayoutIds(opts?: {
  sellerId?: string;
}): Promise<{ healed: number; orderIds: string[] }> {
  const where: Prisma.OrderWhereInput = {
    paymentStatus: "paid",
    sellerPayoutProcessor: { not: "PAYPAL" },
    payoutStatus: { in: READY_STATUSES },
    ...(opts?.sellerId ? { sellerId: opts.sellerId } : {}),
    OR: [
      { processorTransferId: { startsWith: "po_" } },
      { processorTransferId: { startsWith: "zero-net:" } },
      { processorTransferId: { startsWith: "bulk-bank:" } },
      { processorTransferId: { startsWith: "manual-bank-paid:" } },
    ],
  };

  const stuck = await prisma.order.findMany({
    where,
    select: { id: true },
    take: 500,
  });
  if (stuck.length === 0) return { healed: 0, orderIds: [] };

  const now = new Date();
  const orderIds = stuck.map((o) => o.id);
  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: {
      payoutStatus: OrderPayoutStatus.paid_out,
      payoutReleasedAt: now,
      payoutBlockedReason: null,
    },
  });

  return { healed: orderIds.length, orderIds };
}

async function estimateReadyOrderNets(
  orderIds: string[],
): Promise<Array<{ id: string; estimatedNetUsdCents: number; sortAtMs: number }>> {
  if (orderIds.length === 0) return [];
  const rows = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      paymentStatus: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippedAt: true,
      carrierAcceptedAt: true,
      createdAt: true,
      listing: { select: { isCompanyListing: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
        },
      },
    },
  });

  return rows.map((o) => {
    const saleBasisUsd = orderItemSaleBasisUsd(o);
    const liveShow = o.liveShippingSession?.liveShow ?? null;
    const feePct = resolvePlatformFeePercentForSellerOrder({
      isCompanyListing: o.listing.isCompanyListing,
      liveShowId: o.liveShippingSession?.liveShowId ?? null,
      liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(liveShow),
      orderItemPriceUsd: saleBasisUsd,
      orderPaymentStatus: o.paymentStatus,
    });
    const netUsd = estimateSellerOrderPayoutUsd({
      itemPriceUsd: saleBasisUsd,
      shippingPriceUsd: o.shippingPriceUsd,
      platformFeePercent: feePct,
      payoutReserveAmountCents: 0,
      shippingLabelCostCents: o.shippingLabelCostCents ?? 0,
      shippingLabelCostReversedCents: o.shippingLabelCostReversedCents ?? 0,
    });
    const sortAt =
      o.shippedAt?.getTime() ?? o.carrierAcceptedAt?.getTime() ?? o.createdAt.getTime();
    return {
      id: o.id,
      estimatedNetUsdCents: Math.round(netUsd * 100),
      sortAtMs: sortAt,
    };
  });
}

async function markOrdersPaidOutFromBulkPayout(args: {
  orderIds: string[];
  payoutId: string;
  now: Date;
}): Promise<number> {
  if (args.orderIds.length === 0) return 0;
  const transferId = `bulk-bank:${args.payoutId}`;
  const result = await prisma.order.updateMany({
    where: {
      id: { in: args.orderIds },
      payoutStatus: { in: READY_STATUSES },
    },
    data: {
      payoutStatus: OrderPayoutStatus.paid_out,
      payoutReleasedAt: args.now,
      payoutBlockedReason: null,
      processorTransferId: transferId,
    },
  });
  await prisma.order.updateMany({
    where: { id: { in: args.orderIds }, fundsReleasedAt: null },
    data: { fundsReleasedAt: args.now },
  });
  return result.count;
}

/**
 * Pull Connect bank payouts + balances and clear ready orders that Stripe already banked.
 * 1) Heal local po_/sentinels
 * 2) Match metadata.orderId payouts
 * 3) Connect shortfall: ready net − (available+pending) → oldest orders already banked
 * 4) Legacy emptied-balance full clear when payouts cover the whole ready net
 */
export async function reconcileStripeBankPayoutsForReadySellers(opts?: {
  sellerId?: string;
  limitPerSeller?: number;
}): Promise<{
  healedLocal: number;
  matchedFromStripe: number;
  matchedBulkFromBalance: number;
  matchedFromConnectShortfall: number;
  sellersScanned: number;
  orderIds: string[];
}> {
  const local = await healOrdersWithExistingBankPayoutIds({ sellerId: opts?.sellerId });
  const matchedIds = new Set(local.orderIds);

  if (!isStripeConfigured()) {
    return {
      healedLocal: local.healed,
      matchedFromStripe: 0,
      matchedBulkFromBalance: 0,
      matchedFromConnectShortfall: 0,
      sellersScanned: 0,
      orderIds: [...matchedIds],
    };
  }

  const readyWhere: Prisma.OrderWhereInput = {
    paymentStatus: "paid",
    sellerPayoutProcessor: { not: "PAYPAL" },
    payoutStatus: { in: READY_STATUSES },
    ...(opts?.sellerId ? { sellerId: opts.sellerId } : {}),
    AND: [adminBankPayoutNotAlreadyPaidWhere],
  };

  const readyOrders = await prisma.order.findMany({
    where: readyWhere,
    select: {
      id: true,
      sellerId: true,
      seller: { select: { stripeAccountId: true } },
    },
    take: 1000,
  });

  const bySeller = new Map<string, { accountId: string; orderIds: string[] }>();
  for (const o of readyOrders) {
    const accountId = o.seller.stripeAccountId?.trim();
    if (!accountId) continue;
    const cur = bySeller.get(o.sellerId);
    if (!cur) bySeller.set(o.sellerId, { accountId, orderIds: [o.id] });
    else cur.orderIds.push(o.id);
  }

  const stripe = getStripe();
  const limitPerSeller = Math.min(100, Math.max(10, opts?.limitPerSeller ?? 100));
  const now = new Date();
  let matchedFromStripe = 0;
  let matchedBulkFromBalance = 0;
  let matchedFromConnectShortfall = 0;

  for (const [, { accountId, orderIds }] of bySeller) {
    try {
      const payouts = await stripe.payouts.list(
        { limit: limitPerSeller },
        { stripeAccount: accountId },
      );
      const readySet = new Set(orderIds.filter((id) => !matchedIds.has(id)));

      for (const p of payouts.data) {
        if (p.status === "canceled" || p.status === "failed") continue;
        const metaOrderId = typeof p.metadata?.orderId === "string" ? p.metadata.orderId.trim() : "";
        if (!metaOrderId || !readySet.has(metaOrderId)) continue;
        if (matchedIds.has(metaOrderId)) continue;

        await prisma.order.update({
          where: { id: metaOrderId },
          data: {
            payoutStatus: OrderPayoutStatus.paid_out,
            payoutReleasedAt: now,
            payoutBlockedReason: null,
            processorTransferId: p.id,
          },
        });
        matchedIds.add(metaOrderId);
        matchedFromStripe += 1;
        readySet.delete(metaOrderId);
      }

      let remaining = [...readySet];
      if (remaining.length === 0) continue;

      const balance = await stripe.balance.retrieve({ stripeAccount: accountId });
      const availableUsdCents = balance.available
        .filter((b) => b.currency === "usd")
        .reduce((sum, b) => sum + b.amount, 0);
      const pendingUsdCents = balance.pending
        .filter((b) => b.currency === "usd")
        .reduce((sum, b) => sum + b.amount, 0);

      const bulkOrAnyPaid = payouts.data.filter(
        (p) => p.status === "paid" || p.status === "in_transit" || p.status === "pending",
      );
      const paidPayoutUsdCents = bulkOrAnyPaid.reduce((sum, p) => sum + (p.amount ?? 0), 0);
      const orderNets = await estimateReadyOrderNets(remaining);
      const estimatedReadyNetUsdCents = orderNets.reduce((s, o) => s + o.estimatedNetUsdCents, 0);

      // Primary: clear whatever ready net exceeds funds still on Connect.
      const { markPaidIds } = allocateOrdersAlreadyBankPaidByConnectShortfall({
        orders: orderNets,
        availableUsdCents,
        pendingUsdCents,
      });

      const anchor =
        bulkOrAnyPaid.find((p) => !p.metadata?.orderId)?.id ||
        bulkOrAnyPaid[0]?.id ||
        `shortfall-sync:${accountId.slice(-8)}`;

      if (markPaidIds.length > 0) {
        const marked = await markOrdersPaidOutFromBulkPayout({
          orderIds: markPaidIds,
          payoutId: anchor,
          now,
        });
        for (const id of markPaidIds) {
          matchedIds.add(id);
          readySet.delete(id);
        }
        matchedFromConnectShortfall += marked;
        remaining = [...readySet];
      }

      // Secondary: full clear when Connect is empty and recent payouts cover the whole queue.
      if (remaining.length > 0) {
        const remainingNets = orderNets.filter((o) => readySet.has(o.id));
        const remainingCents = remainingNets.reduce((s, o) => s + o.estimatedNetUsdCents, 0);
        if (
          connectBulkPayoutCoversReadyQueue({
            availableUsdCents,
            pendingUsdCents,
            paidPayoutUsdCents,
            estimatedReadyNetUsdCents: remainingCents || estimatedReadyNetUsdCents,
          })
        ) {
          const marked = await markOrdersPaidOutFromBulkPayout({
            orderIds: remaining,
            payoutId: anchor,
            now,
          });
          for (const id of remaining) matchedIds.add(id);
          matchedBulkFromBalance += marked;
        }
      }
    } catch (e) {
      console.warn("[reconcileStripeBankPayouts] seller scan failed", {
        accountId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    healedLocal: local.healed,
    matchedFromStripe,
    matchedBulkFromBalance,
    matchedFromConnectShortfall,
    sellersScanned: bySeller.size,
    orderIds: [...matchedIds],
  };
}

/** Admin: mark an order paid_out without creating a new Stripe payout (already paid off-platform). */
export async function markOrderBankPayoutAlreadyPaid(args: {
  orderId: string;
  adminId: string;
  reason: string;
  processorTransferId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: {
      id: true,
      sellerId: true,
      paymentStatus: true,
      sellerPayoutProcessor: true,
      payoutStatus: true,
      processorTransferId: true,
      fundsReleasedAt: true,
    },
  });
  if (!order) return { ok: false, error: "Not found" };
  if (order.paymentStatus !== "paid") return { ok: false, error: "Order is not paid." };
  if (order.sellerPayoutProcessor === "PAYPAL") {
    return { ok: false, error: "Use PayPal tools for PayPal-rail orders." };
  }
  if (order.payoutStatus === OrderPayoutStatus.paid_out) {
    return { ok: true };
  }

  const now = new Date();
  const existingPo = order.processorTransferId?.trim();
  const provided = args.processorTransferId?.trim() || null;
  const processorTransferId =
    (provided && isStripeBankPayoutId(provided) ? provided : null) ||
    (existingPo && orderAlreadyHasBankPayoutRecord(existingPo) ? existingPo : null) ||
    `manual-bank-paid:${args.orderId}`;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      payoutStatus: OrderPayoutStatus.paid_out,
      payoutReleasedAt: now,
      payoutBlockedReason: null,
      processorTransferId,
      ...(order.fundsReleasedAt ? {} : { fundsReleasedAt: now }),
    },
  });

  const { logPayoutEligibilityDecision } = await import("@/lib/payout-audit-log");
  await logPayoutEligibilityDecision({
    sellerId: order.sellerId,
    orderId: order.id,
    adminId: args.adminId,
    action: "order_payout_marked_already_paid",
    previousStatus: order.payoutStatus,
    newStatus: OrderPayoutStatus.paid_out,
    reason: args.reason,
  });

  return { ok: true };
}

/** Admin: mark every ready bank-payout order for a seller as already paid (Dashboard bulk payout). */
export async function markSellerReadyOrdersAlreadyPaid(args: {
  sellerId: string;
  adminId: string;
  reason: string;
  processorTransferId?: string | null;
}): Promise<{ ok: true; marked: number; orderIds: string[] } | { ok: false; error: string }> {
  const sellerId = args.sellerId.trim();
  if (!sellerId) return { ok: false, error: "sellerId required" };

  const ready = await prisma.order.findMany({
    where: {
      sellerId,
      paymentStatus: "paid",
      sellerPayoutProcessor: { not: "PAYPAL" },
      payoutStatus: { in: READY_STATUSES },
      AND: [adminBankPayoutNotAlreadyPaidWhere],
    },
    select: { id: true, payoutStatus: true },
    take: 500,
  });
  if (ready.length === 0) {
    return { ok: true, marked: 0, orderIds: [] };
  }

  const provided = args.processorTransferId?.trim() || null;
  const transferBase =
    provided && isStripeBankPayoutId(provided) ? provided : `manual-bank-paid:seller:${sellerId}`;
  const now = new Date();
  const orderIds = ready.map((o) => o.id);

  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: {
      payoutStatus: OrderPayoutStatus.paid_out,
      payoutReleasedAt: now,
      payoutBlockedReason: null,
      processorTransferId: isStripeBankPayoutId(transferBase)
        ? `bulk-bank:${transferBase}`
        : transferBase,
    },
  });
  await prisma.order.updateMany({
    where: { id: { in: orderIds }, fundsReleasedAt: null },
    data: { fundsReleasedAt: now },
  });

  const { logPayoutEligibilityDecision } = await import("@/lib/payout-audit-log");
  for (const o of ready) {
    await logPayoutEligibilityDecision({
      sellerId,
      orderId: o.id,
      adminId: args.adminId,
      action: "seller_ready_orders_marked_already_paid",
      previousStatus: o.payoutStatus,
      newStatus: OrderPayoutStatus.paid_out,
      reason: args.reason,
    });
  }

  return { ok: true, marked: orderIds.length, orderIds };
}
