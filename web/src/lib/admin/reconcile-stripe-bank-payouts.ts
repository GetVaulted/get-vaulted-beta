import type { Prisma } from "@/generated/prisma/client";
import { OrderPayoutStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
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
      ],
    },
  ],
};

/**
 * Flip ready-status orders that already have `po_` / `zero-net:` to `paid_out`.
 * Heals the split-write gap (payout created, status never updated).
 */
export async function healOrdersWithExistingBankPayoutIds(opts?: {
  sellerId?: string;
}): Promise<{ healed: number; orderIds: string[] }> {
  const where = {
    paymentStatus: "paid" as const,
    sellerPayoutProcessor: { not: "PAYPAL" as const },
    payoutStatus: { in: READY_STATUSES },
    ...(opts?.sellerId ? { sellerId: opts.sellerId } : {}),
    OR: [{ processorTransferId: { startsWith: "po_" } }, { processorTransferId: { startsWith: "zero-net:" } }],
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

/**
 * Pull recent Connect bank payouts and mark matching orders paid_out when Stripe
 * already paid them (metadata.orderId) but our queue still says ready.
 */
export async function reconcileStripeBankPayoutsForReadySellers(opts?: {
  sellerId?: string;
  limitPerSeller?: number;
}): Promise<{
  healedLocal: number;
  matchedFromStripe: number;
  sellersScanned: number;
  orderIds: string[];
}> {
  const local = await healOrdersWithExistingBankPayoutIds({ sellerId: opts?.sellerId });
  const matchedIds = new Set(local.orderIds);

  if (!isStripeConfigured()) {
    return {
      healedLocal: local.healed,
      matchedFromStripe: 0,
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
    take: 300,
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
  const limitPerSeller = Math.min(100, Math.max(10, opts?.limitPerSeller ?? 40));
  const now = new Date();
  let matchedFromStripe = 0;

  for (const [sellerId, { accountId, orderIds }] of bySeller) {
    void sellerId;
    try {
      const payouts = await stripe.payouts.list(
        { limit: limitPerSeller },
        { stripeAccount: accountId },
      );
      const readySet = new Set(orderIds);
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
            ...(p.created
              ? {}
              : {}),
          },
        });
        // Only set fundsReleasedAt if null — use update with conditional via find first is heavier;
        // leave fundsReleasedAt alone if already set by calling a narrow update.
        matchedIds.add(metaOrderId);
        matchedFromStripe += 1;
        readySet.delete(metaOrderId);
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
