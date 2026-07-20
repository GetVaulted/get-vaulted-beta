/**
 * One-shot seller reconciliation for @dtdt (read-only).
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

function money(cents: number): number {
  return Math.round(cents) / 100;
}

function usd(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getStripe, isStripeConfigured } = await import("../src/lib/stripe");
  const { applicationFeeCentsFromSubtotalUsd, platformFeeBaseUsd } = await import(
    "../src/lib/platform-fee-policy"
  );
  const { resolveSellerPlatformFeeDisplay } = await import("../src/lib/seller-platform-fee-display");
  const { liveShowGmvForFeeTierReconstruction } = await import("../src/lib/live-show-gmv");
  const { estimateStripeProcessingFeeCents } = await import("../src/lib/seller-payout-estimate");
  const { ensureLiveShowFeeCache } = await import("../src/services/live-show-fee-settings");
  const { ensureMarketplacePlatformFeeCache } = await import("../src/services/platform-fee-settings");
  const { isLabelCostChargeable } = await import("../src/services/shipping/label-finance");

  await Promise.all([ensureLiveShowFeeCache(true), ensureMarketplacePlatformFeeCache(true)]);

  const seller = await prisma.user.findFirst({
    where: { username: { equals: "dtdt", mode: "insensitive" } },
    select: {
      id: true,
      username: true,
      email: true,
      stripeAccountId: true,
      sellerPlatformFeePercentOverride: true,
      payoutMetrics: { select: { lifetimeGmvUsd: true, lifetimeInstantPayoutUsd: true } },
    },
  });
  if (!seller) throw new Error("Seller @dtdt not found");

  const orders = await prisma.order.findMany({
    where: {
      sellerId: seller.id,
      paymentStatus: { in: ["paid", "layaway_completed", "refunded", "chargeback"] },
    },
    select: {
      id: true,
      createdAt: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      taxAmountCents: true,
      totalUsd: true,
      paymentStatus: true,
      payoutStatus: true,
      platformFeeCents: true,
      platformFeePercentApplied: true,
      platformFeeBasisCents: true,
      stripeApplicationFeeCents: true,
      stripeProcessingFeeCents: true,
      shippingChargedCents: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      stripeTransferId: true,
      stripePaymentIntentId: true,
      payoutReserveAmountCents: true,
      listing: { select: { isCompanyListing: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: {
            select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true },
          },
        },
      },
      labelFinances: {
        select: {
          status: true,
          labelCostCents: true,
          sellerClawbackCents: true,
          sellerCreditCents: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  let lifetimeGmvCents = 0;
  let platformFeeCents = 0;
  let stripeProcessingCents = 0;
  let stripeProcessingEstimatedCount = 0;
  let buyerShippingCollectedCents = 0;
  let labelCostCents = 0;
  let labelCreditCents = 0;
  let labelClawbackCents = 0;
  let orderRefundCents = 0;
  let chargebackCents = 0;
  let paidOrderCount = 0;
  let refundedOrderCount = 0;
  let chargebackOrderCount = 0;

  // Expected Connect net from order economics (before bank payouts):
  // item + buyerShipping - platformFee - processing - netLabelDeduction - reserve
  let expectedSellerNetFromOrdersCents = 0;
  let transferIds: string[] = [];

  for (const o of orders) {
    const itemCents = Math.round(platformFeeBaseUsd(o.itemPriceUsd) * 100);
    const buyerShip =
      o.shippingChargedCents != null && Number.isFinite(o.shippingChargedCents)
        ? Math.max(0, Math.floor(o.shippingChargedCents))
        : Math.max(0, Math.round(Math.max(0, o.shippingPriceUsd) * 100));
    const totalCents = Math.max(0, Math.round(o.totalUsd * 100));

    const fee = resolveSellerPlatformFeeDisplay({
      itemPriceUsd: o.itemPriceUsd,
      isCompanyListing: Boolean(o.listing.isCompanyListing),
      platformFeeCents: o.platformFeeCents,
      platformFeePercentApplied: o.platformFeePercentApplied,
      platformFeeBasisCents: o.platformFeeBasisCents,
      liveShowId: o.liveShippingSession?.liveShowId ?? null,
      liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(o.liveShippingSession?.liveShow),
      orderPaymentStatus: o.paymentStatus,
      sellerPlatformFeePercentOverride: seller.sellerPlatformFeePercentOverride,
    });

    let processing = o.stripeProcessingFeeCents;
    if (processing == null) {
      processing = estimateStripeProcessingFeeCents(totalCents);
      stripeProcessingEstimatedCount += 1;
    } else {
      processing = Math.max(0, processing);
    }

    let orderLabelCost = 0;
    let orderLabelCredit = 0;
    let orderLabelClawback = 0;
    if (o.labelFinances.length > 0) {
      for (const lf of o.labelFinances) {
        if (isLabelCostChargeable(lf.status)) orderLabelCost += Math.max(0, lf.labelCostCents);
        orderLabelCredit += Math.max(0, lf.sellerCreditCents);
        orderLabelClawback += Math.max(0, lf.sellerClawbackCents);
      }
    } else if (o.shippingLabelCostCents != null && o.shippingLabelCostCents > 0) {
      orderLabelCost = o.shippingLabelCostCents;
      orderLabelClawback = Math.max(0, o.shippingLabelCostReversedCents ?? 0);
    }

    const netLabelDeduction = Math.max(0, orderLabelClawback - orderLabelCredit);
    const reserve = Math.max(0, o.payoutReserveAmountCents ?? 0);

    if (o.paymentStatus === "paid" || o.paymentStatus === "layaway_completed") {
      paidOrderCount += 1;
      lifetimeGmvCents += itemCents;
      platformFeeCents += fee.platformFeeCents;
      stripeProcessingCents += processing;
      buyerShippingCollectedCents += buyerShip;
      labelCostCents += orderLabelCost;
      labelCreditCents += orderLabelCredit;
      labelClawbackCents += orderLabelClawback;

      const sellerNet =
        itemCents + buyerShip - fee.platformFeeCents - processing - netLabelDeduction - reserve;
      expectedSellerNetFromOrdersCents += Math.max(0, sellerNet);
      if (o.stripeTransferId) transferIds.push(o.stripeTransferId);
    } else if (o.paymentStatus === "refunded") {
      refundedOrderCount += 1;
      orderRefundCents += totalCents;
      // Still count label credits/clawbacks that happened on refunded orders
      labelCostCents += orderLabelCost;
      labelCreditCents += orderLabelCredit;
      labelClawbackCents += orderLabelClawback;
    } else if (o.paymentStatus === "chargeback") {
      chargebackOrderCount += 1;
      chargebackCents += totalCents;
      labelCostCents += orderLabelCost;
      labelCreditCents += orderLabelCredit;
      labelClawbackCents += orderLabelClawback;
    }
  }

  // Stripe Connect actual balance + payouts
  let actualAvailableCents: number | null = null;
  let actualPendingCents: number | null = null;
  let actualTotalBalanceCents: number | null = null;
  let stripePayoutsTotalCents = 0;
  let stripePayoutCount = 0;
  let stripeTransferSumCents: number | null = null;
  let stripeTransferReversalSumCents = 0;
  let stripeError: string | null = null;

  if (!isStripeConfigured() || !seller.stripeAccountId) {
    stripeError = !seller.stripeAccountId ? "Seller has no stripeAccountId" : "Stripe not configured";
  } else {
    const stripe = getStripe();
    try {
      const bal = await stripe.balance.retrieve({ stripeAccount: seller.stripeAccountId });
      actualAvailableCents = bal.available
        .filter((b) => b.currency === "usd")
        .reduce((s, b) => s + b.amount, 0);
      actualPendingCents = bal.pending
        .filter((b) => b.currency === "usd")
        .reduce((s, b) => s + b.amount, 0);
      actualTotalBalanceCents = (actualAvailableCents ?? 0) + (actualPendingCents ?? 0);

      // Paginate payouts (bank withdrawals from Connect)
      let startingAfter: string | undefined;
      for (let page = 0; page < 50; page++) {
        const payouts = await stripe.payouts.list(
          { limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) },
          { stripeAccount: seller.stripeAccountId },
        );
        for (const p of payouts.data) {
          if (p.currency !== "usd") continue;
          if (p.status === "canceled" || p.status === "failed") continue;
          stripePayoutsTotalCents += p.amount;
          stripePayoutCount += 1;
        }
        if (!payouts.has_more || payouts.data.length === 0) break;
        startingAfter = payouts.data[payouts.data.length - 1]!.id;
      }

      // Sum unique transfers (destination charge transfers) — sample via retrieve
      const uniqueTransfers = [...new Set(transferIds)];
      let transferSum = 0;
      let reversalSum = 0;
      for (const tid of uniqueTransfers) {
        try {
          const tr = await stripe.transfers.retrieve(tid, {
            expand: ["reversals"],
          });
          transferSum += tr.amount;
          const revs = tr.reversals?.data ?? [];
          for (const r of revs) reversalSum += r.amount;
        } catch {
          /* skip missing */
        }
      }
      stripeTransferSumCents = transferSum;
      stripeTransferReversalSumCents = reversalSum;
    } catch (e) {
      stripeError = e instanceof Error ? e.message : String(e);
    }
  }

  // Expected Stripe Connect balance ≈ order nets still in Connect
  // = transfers into Connect - label reversals + label credits - bank payouts
  // Prefer Stripe-sourced transfer/reversal/payout when available.
  const expectedFromStripeFlowsCents =
    stripeTransferSumCents != null
      ? stripeTransferSumCents - stripeTransferReversalSumCents + labelCreditCents - stripePayoutsTotalCents
      : null;

  // Book expected: seller net from paid orders still held (not yet paid out to bank).
  // If we know bank payouts, expected remaining = expectedSellerNetFromOrders - payouts
  // (label credits already netted in expectedSellerNet via clawback-credit; credits that
  // arrived as separate transfers after clawback are in labelCreditCents which reduced netLabelDeduction)
  const expectedRemainingFromBooksCents = expectedSellerNetFromOrdersCents - stripePayoutsTotalCents;

  const expectedBalanceCents =
    expectedFromStripeFlowsCents != null
      ? expectedFromStripeFlowsCents
      : expectedRemainingFromBooksCents;

  const actualBalanceCents = actualTotalBalanceCents;
  const differenceCents =
    actualBalanceCents != null ? actualBalanceCents - expectedBalanceCents : null;

  const report = {
    seller: {
      id: seller.id,
      username: seller.username,
      email: seller.email,
      stripeAccountId: seller.stripeAccountId,
      cachedLifetimeGmvUsd: seller.payoutMetrics?.lifetimeGmvUsd ?? null,
    },
    scope: {
      orderCount: orders.length,
      paidOrderCount,
      refundedOrderCount,
      chargebackOrderCount,
      stripeProcessingEstimatedOrderCount: stripeProcessingEstimatedCount,
      uniqueTransferIds: [...new Set(transferIds)].length,
    },
    totalsUsd: {
      lifetimeGmv: money(lifetimeGmvCents),
      getVaultedFees: money(platformFeeCents),
      stripeProcessing: money(stripeProcessingCents),
      buyerShippingCollected: money(buyerShippingCollectedCents),
      labelCosts: money(labelCostCents),
      shippingCreditsRefunds: money(labelCreditCents),
      labelClawbacks: money(labelClawbackCents),
      netLabelDeduction: money(Math.max(0, labelClawbackCents - labelCreditCents)),
      orderRefunds: money(orderRefundCents),
      chargebacks: money(chargebackCents),
      sellerPayoutsToBank: money(stripePayoutsTotalCents),
      expectedSellerNetFromPaidOrders: money(expectedSellerNetFromOrdersCents),
      stripeTransfersIn: stripeTransferSumCents != null ? money(stripeTransferSumCents) : null,
      stripeTransferReversals: money(stripeTransferReversalSumCents),
    },
    stripeBalanceUsd: {
      available: actualAvailableCents != null ? money(actualAvailableCents) : null,
      pending: actualPendingCents != null ? money(actualPendingCents) : null,
      actualTotal: actualBalanceCents != null ? money(actualBalanceCents) : null,
      expected: money(expectedBalanceCents),
      expectedMethod:
        expectedFromStripeFlowsCents != null
          ? "transfers_in - transfer_reversals + label_credits - bank_payouts"
          : "sum(order_seller_nets) - bank_payouts",
      differenceActualMinusExpected: differenceCents != null ? money(differenceCents) : null,
      payoutCount: stripePayoutCount,
      error: stripeError,
    },
    formulas: {
      lifetimeGmv: "SUM(itemPriceUsd) for paid/layaway_completed",
      getVaultedFees: "SUM(platformFeeCents persisted or reconstructed); never stripeApplicationFeeCents",
      stripeProcessing: "SUM(stripeProcessingFeeCents) else estimate 2.9%+$0.30 on totalUsd",
      buyerShipping: "SUM(shippingChargedCents ?? shippingPriceUsd*100)",
      labelCosts: "SUM(chargeable ShipmentLabelFinance.labelCostCents) else Order.shippingLabelCostCents",
      shippingCredits: "SUM(ShipmentLabelFinance.sellerCreditCents)",
      orderRefunds: "SUM(totalUsd) where paymentStatus=refunded",
      sellerPayouts: "SUM(Stripe Connect payouts to bank, excl failed/canceled)",
      expectedBalance:
        "Prefer: Stripe transfer amounts − reversals + label credits − bank payouts; else book nets − bank payouts",
      difference: "actual Connect (available+pending) − expected",
    },
    generatedAt: new Date().toISOString(),
  };

  const outBase = path.join(
    webRoot,
    "reports",
    `dtdt-seller-reconciliation-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const body = JSON.stringify(report, null, 2);
  const jsonPath = `${outBase}.json`;
  fs.writeFileSync(jsonPath, body, "utf8");
  const sha = createHash("sha256").update(body).digest("hex");
  fs.writeFileSync(`${outBase}.sha256`, `${sha}\n`, "utf8");

  console.log(JSON.stringify({ ...report, reportPath: jsonPath, sha256: sha }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
