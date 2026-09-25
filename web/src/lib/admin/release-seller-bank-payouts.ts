import { OrderPayoutStatus } from "@/generated/prisma/enums";
import { selectFifoOrdersWithinAvailable } from "@/lib/admin/bank-payout-pushable";
import { listOrdersReadyForAdminBankPayout } from "@/lib/admin/orders-ready-for-bank-payout";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { releaseSellerStripePayout } from "@/services/payout/stripe-seller-payout";

function usdBalanceCents(
  buckets: Array<{ amount: number; currency: string }> | undefined,
): number {
  if (!buckets?.length) return 0;
  return buckets.filter((b) => b.currency === "usd").reduce((sum, b) => sum + b.amount, 0);
}

/**
 * Admin: push Connect→bank payouts for one seller, oldest ready orders first,
 * never exceeding live Connect available balance.
 */
export async function releaseSellerReadyBankPayouts(args: {
  sellerId: string;
  adminId: string;
  reason: string;
}): Promise<{
  ok: true;
  pushed: number;
  skipped: number;
  failed: number;
  totalPaidUsd: number;
  remainingAvailableUsd: number | null;
  results: Array<{ orderId: string; ok: boolean; reason?: string; netUsd?: number }>;
}> {
  const sellerId = args.sellerId.trim();
  if (!sellerId) {
    return {
      ok: true,
      pushed: 0,
      skipped: 0,
      failed: 0,
      totalPaidUsd: 0,
      remainingAvailableUsd: null,
      results: [],
    };
  }

  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      stripePayoutsEnabled: true,
    },
  });
  if (!seller?.stripeAccountId?.trim() || !seller.stripeOnboardingComplete) {
    return {
      ok: true,
      pushed: 0,
      skipped: 0,
      failed: 1,
      totalPaidUsd: 0,
      remainingAvailableUsd: null,
      results: [{ orderId: "", ok: false, reason: "stripe_not_ready" }],
    };
  }
  if (seller.stripePayoutsEnabled === false) {
    return {
      ok: true,
      pushed: 0,
      skipped: 0,
      failed: 1,
      totalPaidUsd: 0,
      remainingAvailableUsd: null,
      results: [{ orderId: "", ok: false, reason: "stripe_payouts_disabled" }],
    };
  }
  if (!isStripeConfigured()) {
    return {
      ok: true,
      pushed: 0,
      skipped: 0,
      failed: 1,
      totalPaidUsd: 0,
      remainingAvailableUsd: null,
      results: [{ orderId: "", ok: false, reason: "stripe_not_configured" }],
    };
  }

  const accountId = seller.stripeAccountId.trim();
  const stripe = getStripe();
  const balance = await stripe.balance.retrieve({ stripeAccount: accountId });
  let remainingCents = usdBalanceCents(balance.available);

  const allReady = await listOrdersReadyForAdminBankPayout(1000);
  const sellerOrders = allReady
    .filter((o) => o.sellerId === sellerId)
    .sort((a, b) => {
      const aT = a.shippedAt ? Date.parse(a.shippedAt) : Date.parse(a.createdAt);
      const bT = b.shippedAt ? Date.parse(b.shippedAt) : Date.parse(b.createdAt);
      if (aT !== bT) return aT - bT;
      return a.orderId.localeCompare(b.orderId);
    });

  const fifo = selectFifoOrdersWithinAvailable({
    ordersOldestFirst: sellerOrders.map((o) => ({
      orderId: o.orderId,
      estimatedNetUsdCents: Math.round(o.estimatedNetUsd * 100),
    })),
    availableUsdCents: remainingCents,
  });

  const selectedIds = new Set(fifo.selected.map((o) => o.orderId));
  const results: Array<{ orderId: string; ok: boolean; reason?: string; netUsd?: number }> = [];
  let pushed = 0;
  let skipped = 0;
  let failed = 0;
  let totalPaidCents = 0;
  const now = new Date();
  const reason = args.reason.trim() || "Admin seller bank payout release";

  for (let i = 0; i < sellerOrders.length; i++) {
    const order = sellerOrders[i]!;
    if (!selectedIds.has(order.orderId)) {
      skipped += 1;
      results.push({
        orderId: order.orderId,
        ok: false,
        reason: "exceeds_available_balance",
        netUsd: order.estimatedNetUsd,
      });
      continue;
    }

    const needCents = Math.round(order.estimatedNetUsd * 100);
    // Live re-check before each Stripe payout create.
    const live = await stripe.balance.retrieve({ stripeAccount: accountId });
    remainingCents = usdBalanceCents(live.available);
    if (needCents >= 1 && needCents > remainingCents) {
      skipped += 1;
      results.push({
        orderId: order.orderId,
        ok: false,
        reason: "insufficient_available_balance",
        netUsd: order.estimatedNetUsd,
      });
      for (let j = i + 1; j < sellerOrders.length; j++) {
        const rest = sellerOrders[j]!;
        if (selectedIds.has(rest.orderId)) {
          skipped += 1;
          results.push({
            orderId: rest.orderId,
            ok: false,
            reason: "stopped_after_insufficient_balance",
            netUsd: rest.estimatedNetUsd,
          });
        }
      }
      break;
    }

    const prev = await prisma.order.findUnique({
      where: { id: order.orderId },
      select: { payoutStatus: true, fundsReleasedAt: true, sellerId: true },
    });
    if (!prev || prev.sellerId !== sellerId) {
      failed += 1;
      results.push({ orderId: order.orderId, ok: false, reason: "not_found" });
      continue;
    }

    const stripePay = await releaseSellerStripePayout(order.orderId, { force: true });
    if (!stripePay.ok && stripePay.reason !== "already_paid_out" && stripePay.reason !== "zero_net") {
      failed += 1;
      results.push({
        orderId: order.orderId,
        ok: false,
        reason: stripePay.reason ?? "stripe_payout_failed",
        netUsd: order.estimatedNetUsd,
      });
      if (stripePay.reason === "insufficient_available_balance") {
        for (let j = i + 1; j < sellerOrders.length; j++) {
          const rest = sellerOrders[j]!;
          if (selectedIds.has(rest.orderId)) {
            skipped += 1;
            results.push({
              orderId: rest.orderId,
              ok: false,
              reason: "stopped_after_insufficient_balance",
              netUsd: rest.estimatedNetUsd,
            });
          }
        }
        break;
      }
      continue;
    }

    await prisma.order.update({
      where: { id: order.orderId },
      data: {
        payoutStatus: OrderPayoutStatus.paid_out,
        payoutReleasedAt: now,
        payoutBlockedReason: null,
        ...(prev.fundsReleasedAt ? {} : { fundsReleasedAt: now }),
      },
    });

    await logPayoutEligibilityDecision({
      sellerId,
      orderId: order.orderId,
      adminId: args.adminId,
      action: "order_payout_released",
      previousStatus: prev.payoutStatus,
      newStatus: OrderPayoutStatus.paid_out,
      reason,
    });

    pushed += 1;
    if (needCents >= 1) totalPaidCents += needCents;
    results.push({
      orderId: order.orderId,
      ok: true,
      reason: stripePay.reason,
      netUsd: order.estimatedNetUsd,
    });
  }

  let remainingAvailableUsd: number | null = null;
  try {
    const after = await stripe.balance.retrieve({ stripeAccount: accountId });
    remainingAvailableUsd = usdBalanceCents(after.available) / 100;
  } catch {
    remainingAvailableUsd = remainingCents / 100;
  }

  return {
    ok: true,
    pushed,
    skipped,
    failed,
    totalPaidUsd: Math.round(totalPaidCents) / 100,
    remainingAvailableUsd,
    results,
  };
}
