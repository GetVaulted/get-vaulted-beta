import { createHash } from "node:crypto";

import { OrderPayoutStatus } from "@/generated/prisma/enums";
import { planLumpPayoutCents } from "@/lib/admin/bank-payout-pushable";
import { listOrdersReadyForAdminBankPayout } from "@/lib/admin/orders-ready-for-bank-payout";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { releaseSellerStripePayout } from "@/services/payout/stripe-seller-payout";
import {
  applyOutstandingLiabilityRecovery,
  planOutstandingLiabilityRecoveryForSeller,
} from "@/services/shipping/label-liability-recovery";

function usdBalanceCents(buckets: Array<{ amount: number; currency: string }> | undefined): number {
  if (!buckets?.length) return 0;
  return buckets.filter((b) => b.currency === "usd").reduce((sum, b) => sum + b.amount, 0);
}

export type LumpPayoutResult = {
  ok: true;
  /** Orders settled by this payout. */
  pushed: number;
  skipped: number;
  failed: number;
  /** Dollars that actually left for the bank (the one Stripe payout). */
  totalPaidUsd: number;
  remainingAvailableUsd: number | null;
  payoutId: string | null;
  results: Array<{ orderId: string; ok: boolean; reason?: string; netUsd?: number }>;
};

const empty = (failed = 0, reason?: string): LumpPayoutResult => ({
  ok: true,
  pushed: 0,
  skipped: 0,
  failed,
  totalPaidUsd: 0,
  remainingAvailableUsd: null,
  payoutId: null,
  results: reason ? [{ orderId: "", ok: false, reason }] : [],
});

/**
 * Pure: given what each covered order really nets (from the same checks the per-order payout runs) and the
 * live balance, decide the final lump. Orders are taken oldest first while they fit; if one does not fit, the
 * leftover balance (always less than that order's net) is swept in so the seller gets their whole balance.
 */
export function finalizeLumpCents(args: {
  plannedCentsOldestFirst: Array<{ orderId: string; cents: number }>;
  availableCents: number;
  /** Largest extra amount that may be swept past the covered orders (the next ready order's net), 0 for none. */
  sweepCapCents: number;
}): { includedOrderIds: string[]; includedCents: number; sweepCents: number; lumpCents: number } {
  let remaining = Math.max(0, Math.floor(args.availableCents));
  const included: string[] = [];
  let includedCents = 0;
  let stopped = false;
  for (const o of args.plannedCentsOldestFirst) {
    const need = Math.max(0, Math.floor(o.cents));
    if (need > remaining) {
      stopped = true;
      break;
    }
    included.push(o.orderId);
    includedCents += need;
    remaining -= need;
  }
  const sweepCents = stopped ? remaining : Math.min(remaining, Math.max(0, Math.floor(args.sweepCapCents)));
  return { includedOrderIds: included, includedCents, sweepCents, lumpCents: includedCents + sweepCents };
}

/**
 * Seller-initiated payout as ONE Stripe payout for the seller's whole sendable balance, instead of one small
 * payout per order. Money-safety rules are the same as the per-order path (every covered order still runs the
 * shipped / label-clawback / live-show / Stripe-ready checks through `releaseSellerStripePayout({planOnly})`),
 * and the amount can never exceed the live Connect available balance.
 */
export async function releaseSellerLumpBankPayout(args: {
  sellerId: string;
  adminId: string | null;
  reason: string;
  force?: boolean;
}): Promise<LumpPayoutResult> {
  const sellerId = args.sellerId.trim();
  if (!sellerId) return empty();

  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { stripeAccountId: true, stripeOnboardingComplete: true, stripePayoutsEnabled: true },
  });
  const accountId = seller?.stripeAccountId?.trim();
  if (!accountId || !seller?.stripeOnboardingComplete) return empty(1, "stripe_not_ready");
  if (seller.stripePayoutsEnabled === false) return empty(1, "stripe_payouts_disabled");
  if (!isStripeConfigured()) return empty(1, "stripe_not_configured");

  const stripe = getStripe();
  const availableCents = usdBalanceCents((await stripe.balance.retrieve({ stripeAccount: accountId })).available);

  const sellerOrders = (await listOrdersReadyForAdminBankPayout(1000, { sellerId })).sort((a, b) => {
    const aT = a.shippedAt ? Date.parse(a.shippedAt) : Date.parse(a.createdAt);
    const bT = b.shippedAt ? Date.parse(b.shippedAt) : Date.parse(b.createdAt);
    return aT !== bT ? aT - bT : a.orderId.localeCompare(b.orderId);
  });

  const estimate = planLumpPayoutCents({
    ordersOldestFirst: sellerOrders.map((o) => ({
      orderId: o.orderId,
      estimatedNetUsdCents: Math.round(o.estimatedNetUsd * 100),
    })),
    availableUsdCents: availableCents,
  });
  const coveredSet = new Set(estimate.coveredOrderIds);
  const results: LumpPayoutResult["results"] = [];
  let skipped = 0;
  let failed = 0;
  const reason = args.reason.trim() || "Seller bank payout (lump sum)";

  // Run the real per-order safety checks (no Stripe payout yet) to get each order's authoritative net.
  const planned: Array<{ orderId: string; cents: number; netUsd: number }> = [];
  const settledNoMoney: string[] = [];
  for (const order of sellerOrders) {
    if (!coveredSet.has(order.orderId)) {
      skipped += 1;
      results.push({ orderId: order.orderId, ok: false, reason: "exceeds_available_balance", netUsd: order.estimatedNetUsd });
      continue;
    }
    const check = await releaseSellerStripePayout(order.orderId, { force: args.force !== false, planOnly: true });
    if (check.ok && check.reason === "planned" && typeof check.amountCents === "number") {
      planned.push({ orderId: order.orderId, cents: check.amountCents, netUsd: order.estimatedNetUsd });
    } else if (check.ok && (check.reason === "already_paid_out" || check.reason === "zero_net")) {
      settledNoMoney.push(order.orderId);
    } else {
      failed += 1;
      results.push({ orderId: order.orderId, ok: false, reason: check.reason ?? "check_failed", netUsd: order.estimatedNetUsd });
    }
  }

  // Re-read the balance right before sending, so we never ask for more than is really there.
  const liveCents = usdBalanceCents((await stripe.balance.retrieve({ stripeAccount: accountId })).available);
  const nextNetCents =
    estimate.stoppedOnOrderId == null
      ? 0
      : Math.round((sellerOrders.find((o) => o.orderId === estimate.stoppedOnOrderId)?.estimatedNetUsd ?? 0) * 100);
  const final = finalizeLumpCents({
    plannedCentsOldestFirst: planned,
    availableCents: liveCents,
    sweepCapCents: nextNetCents,
  });
  const includedSet = new Set(final.includedOrderIds);
  for (const p of planned) {
    if (!includedSet.has(p.orderId)) {
      skipped += 1;
      results.push({ orderId: p.orderId, ok: false, reason: "exceeds_available_balance", netUsd: p.netUsd });
    }
  }

  const settleIds = [...final.includedOrderIds, ...settledNoMoney];
  if (final.lumpCents < 1 && settleIds.length === 0) {
    return { ...empty(), skipped, failed, results, remainingAvailableUsd: liveCents / 100 };
  }

  const now = new Date();
  let payoutId: string | null = null;
  let paidCents = 0;

  if (final.lumpCents >= 1) {
    const liabilityPlan = await planOutstandingLiabilityRecoveryForSeller(sellerId, final.lumpCents);
    paidCents = final.lumpCents - liabilityPlan.totalCents;
    // Same order set + same amount => same key, so a retry after a crash returns the SAME Stripe payout.
    const setHash = createHash("sha256")
      .update([...final.includedOrderIds].sort().join(",") + `|${final.lumpCents}`)
      .digest("hex")
      .slice(0, 24);

    try {
      if (paidCents < 1) {
        payoutId = `liability-withheld:lump:${setHash}`;
        await applyOutstandingLiabilityRecovery(liabilityPlan, {
          method: "payout_offset_stripe",
          transactionId: payoutId,
        });
      } else {
        const payout = await stripe.payouts.create(
          {
            amount: paidCents,
            currency: "usd",
            metadata: {
              sellerId,
              source: "get_vaulted_seller_lump_payout",
              orderCount: String(final.includedOrderIds.length),
              sweepCents: String(final.sweepCents),
            },
            statement_descriptor: "GETVAULTED",
          },
          { stripeAccount: accountId, idempotencyKey: `gv_seller_lump_payout_${sellerId}_${setHash}` },
        );
        payoutId = payout.id;
        if (liabilityPlan.items.length > 0) {
          await applyOutstandingLiabilityRecovery(liabilityPlan, {
            method: "payout_offset_stripe",
            transactionId: payout.id,
          });
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[releaseSellerLumpBankPayout] stripe payout failed", { sellerId, accountId, error: message });
      return {
        ...empty(),
        skipped,
        failed: failed + 1,
        results: [...results, { orderId: "", ok: false, reason: "stripe_payout_failed" }],
        remainingAvailableUsd: liveCents / 100,
      };
    }
  }

  // Money has left (or was withheld for liability). Record it against every order it settled.
  const marker = payoutId;
  try {
    if (settleIds.length > 0) {
      const before = await prisma.order.findMany({
        where: { id: { in: settleIds }, sellerId },
        select: { id: true, payoutStatus: true, fundsReleasedAt: true },
      });
      const previous = new Map(before.map((o) => [o.id, o]));
      await prisma.order.updateMany({
        where: { id: { in: [...previous.keys()] } },
        data: {
          payoutStatus: OrderPayoutStatus.paid_out,
          payoutReleasedAt: now,
          payoutBlockedReason: null,
          ...(marker ? { processorTransferId: marker } : {}),
        },
      });
      await prisma.order.updateMany({
        where: { id: { in: [...previous.keys()] }, fundsReleasedAt: null },
        data: { fundsReleasedAt: now },
      });
      for (const id of previous.keys()) {
        await logPayoutEligibilityDecision({
          sellerId,
          orderId: id,
          adminId: args.adminId,
          action: "order_payout_released",
          previousStatus: previous.get(id)!.payoutStatus,
          newStatus: OrderPayoutStatus.paid_out,
          reason: `${reason} (lump sum ${marker ?? "n/a"}, $${(paidCents / 100).toFixed(2)} for ${final.includedOrderIds.length} order(s)${
            final.sweepCents > 0 ? `, includes $${(final.sweepCents / 100).toFixed(2)} leftover balance` : ""
          })`,
        });
      }
    }
  } catch (e) {
    // The payout is already out and idempotent; the reconcile job heals order rows. Never report failure here.
    console.error("[releaseSellerLumpBankPayout] payout sent but order update failed", {
      sellerId,
      payoutId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  for (const p of planned) {
    if (includedSet.has(p.orderId)) results.push({ orderId: p.orderId, ok: true, netUsd: p.netUsd });
  }
  for (const id of settledNoMoney) results.push({ orderId: id, ok: true });

  let remainingAvailableUsd: number | null = null;
  try {
    remainingAvailableUsd =
      usdBalanceCents((await stripe.balance.retrieve({ stripeAccount: accountId })).available) / 100;
  } catch {
    remainingAvailableUsd = Math.max(0, liveCents - paidCents) / 100;
  }

  return {
    ok: true,
    pushed: final.includedOrderIds.length,
    skipped,
    failed,
    totalPaidUsd: Math.round(paidCents) / 100,
    remainingAvailableUsd,
    payoutId,
    results,
  };
}
