import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  estimatePlatformFeeUsd,
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder,
  resolveSellerAbsorbedProcessingFeeUsd,
} from "@/lib/seller-payout-estimate";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";

export type ReconciliationRangeKey = "24h" | "7d" | "30d" | "90d" | "all";

export function resolveReconciliationRangeStart(range: ReconciliationRangeKey): Date | null {
  const now = new Date();
  if (range === "24h") return new Date(now.getTime() - 24 * 3600000);
  if (range === "7d") return new Date(now.getTime() - 7 * 86400000);
  if (range === "30d") return new Date(now.getTime() - 30 * 86400000);
  if (range === "90d") return new Date(now.getTime() - 90 * 86400000);
  return null;
}

const orderSelect = {
  id: true,
  itemPriceUsd: true,
  shippingPriceUsd: true,
  taxUsd: true,
  taxRefundedCents: true,
  totalUsd: true,
  paymentStatus: true,
  payoutStatus: true,
  payoutReserveAmountCents: true,
  shippingLabelCostCents: true,
  shippingLabelCostReversedCents: true,
  stripeProcessingFeeCents: true,
  listing: { select: { isCompanyListing: true } },
  liveShippingSession: {
    select: {
      liveShowId: true,
      liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
    },
  },
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

const PAID_PAYMENT_STATUSES = new Set(["paid", "layaway_completed"]);

function resolveOrderFeePercent(o: OrderRow): number {
  const liveShowId = o.liveShippingSession?.liveShowId ?? null;
  const liveShow = o.liveShippingSession?.liveShow ?? null;
  return resolvePlatformFeePercentForSellerOrder({
    isCompanyListing: Boolean(o.listing.isCompanyListing),
    liveShowId,
    liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(liveShow),
    orderItemPriceUsd: o.itemPriceUsd,
    orderPaymentStatus: o.paymentStatus,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PayoutStatusBreakdownRow = {
  status: string;
  orderCount: number;
  sellerNetUsd: number;
};

export type AdminReconciliationReport = {
  rangeKey: ReconciliationRangeKey;
  rangeStart: string | null;
  generatedAt: string;
  paidOrderCount: number;
  refundedOrderCount: number;
  /** Buyer-facing gross charge total (item + shipping + tax) across paid orders. */
  grossSalesUsd: number;
  /** Item-only sale price across paid orders — the base platform fees are assessed against. */
  gmvUsd: number;
  /** Per-order tiered/flat platform application fee actually assessed (same resolver as seller reports). */
  platformRevenueUsd: number;
  /** Estimated Stripe processing cost absorbed by sellers on Connect (company listings = $0). */
  processingFeesUsd: number;
  salesTaxCollectedUsd: number;
  shippingCollectedUsd: number;
  /** Actual carrier cost paid by the platform for labels purchased (sunk cost regardless of later refund). */
  shippingLabelCostUsd: number;
  /** Sum of seller entitlement (item price + shipping − platform fee − payout reserve) across paid orders. */
  sellerNetUsd: number;
  payoutStatusBreakdown: PayoutStatusBreakdownRow[];
  refundAdjustments: {
    /** Refunded orders plus lost disputes (chargebacks) — both unwind the sale. */
    refundedOrderCount: number;
    chargebackOrderCount: number;
    /** Total buyer-facing amount refunded (item + shipping + tax) for orders refunded/charged-back in range. */
    refundedGrossUsd: number;
    taxReversedUsd: number;
    /** Platform fee originally assessed on now-refunded/charged-back orders. See `platformFeeRetainedOnRefunds` assumption below. */
    platformFeeOnRefundedOrdersUsd: number;
  };
  /** Platform application fees are currently NOT reversed on refund (only the seller's transferred
   *  share is clawed back via `reverse_transfer`). This is an explicit, flagged assumption — not a
   *  verified business rule — see the audit report for details. */
  platformFeeRetainedOnRefunds: true;
  /** Platform fee revenue minus unrecovered carrier label cost (label spend not clawed back from seller). */
  companyNetRevenueUsd: number;
  assumptions: string[];
};

export async function loadAdminReconciliationReport(
  rangeKey: ReconciliationRangeKey = "30d",
): Promise<AdminReconciliationReport> {
  const rangeStart = resolveReconciliationRangeStart(rangeKey);
  const createdAtFilter = rangeStart ? { createdAt: { gte: rangeStart } } : {};

  const orders = await prisma.order.findMany({
    where: { ...createdAtFilter },
    select: orderSelect,
    take: 10000,
  });

  let grossSalesUsd = 0;
  let gmvUsd = 0;
  let platformRevenueUsd = 0;
  let processingFeesUsd = 0;
  let salesTaxCollectedUsd = 0;
  let shippingCollectedUsd = 0;
  let sellerNetUsd = 0;
  let paidOrderCount = 0;

  let refundedOrderCount = 0;
  let chargebackOrderCount = 0;
  let refundedGrossUsd = 0;
  let taxReversedUsd = 0;
  let platformFeeOnRefundedOrdersUsd = 0;

  let shippingLabelCostUsd = 0;
  let unrecoveredLabelCostUsd = 0;

  const payoutBuckets = new Map<string, { orderCount: number; sellerNetUsd: number }>();

  for (const o of orders) {
    // Label cost is a real sunk carrier expense the moment a label is purchased, independent of
    // whether the sale is later refunded — count it whenever present.
    if (o.shippingLabelCostCents != null) {
      const labelUsd = Math.max(0, o.shippingLabelCostCents) / 100;
      shippingLabelCostUsd += labelUsd;
      const reversedUsd = Math.max(0, o.shippingLabelCostReversedCents ?? 0) / 100;
      unrecoveredLabelCostUsd += Math.max(0, labelUsd - reversedUsd);
    }

    if (PAID_PAYMENT_STATUSES.has(o.paymentStatus)) {
      paidOrderCount += 1;
      const item = Math.max(0, o.itemPriceUsd);
      const feePct = resolveOrderFeePercent(o);
      const feeUsd = o.listing.isCompanyListing ? 0 : estimatePlatformFeeUsd({ itemPriceUsd: item, platformFeePercent: feePct });

      grossSalesUsd += Math.max(0, o.totalUsd);
      gmvUsd += item;
      platformRevenueUsd += feeUsd;
      const processingUsd = resolveSellerAbsorbedProcessingFeeUsd({
        isCompanyListing: Boolean(o.listing.isCompanyListing),
        stripeProcessingFeeCents: o.stripeProcessingFeeCents,
        buyerChargeTotalUsd: o.totalUsd,
      });
      processingFeesUsd += processingUsd;
      salesTaxCollectedUsd += Math.max(0, o.taxUsd);
      shippingCollectedUsd += Math.max(0, o.shippingPriceUsd);

      // Same seller-net formula as Admin Bank Payouts / Seller HQ.
      const net = estimateSellerOrderPayoutUsd({
        itemPriceUsd: item,
        shippingPriceUsd: o.shippingPriceUsd,
        platformFeePercent: feePct,
        payoutReserveAmountCents: o.payoutReserveAmountCents,
        shippingLabelCostCents: o.shippingLabelCostCents,
        shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
        stripeProcessingFeeUsd: processingUsd,
      });
      sellerNetUsd += Math.max(0, net);

      const bucket = payoutBuckets.get(o.payoutStatus) ?? { orderCount: 0, sellerNetUsd: 0 };
      bucket.orderCount += 1;
      bucket.sellerNetUsd += Math.max(0, net);
      payoutBuckets.set(o.payoutStatus, bucket);
    } else if (o.paymentStatus === "refunded" || o.paymentStatus === "chargeback") {
      refundedOrderCount += 1;
      if (o.paymentStatus === "chargeback") chargebackOrderCount += 1;
      refundedGrossUsd += Math.max(0, o.totalUsd);
      taxReversedUsd += Math.max(0, o.taxRefundedCents) / 100;
      const item = Math.max(0, o.itemPriceUsd);
      const feePct = resolveOrderFeePercent(o);
      platformFeeOnRefundedOrdersUsd += o.listing.isCompanyListing
        ? 0
        : estimatePlatformFeeUsd({ itemPriceUsd: item, platformFeePercent: feePct });
    }
  }

  const payoutStatusBreakdown: PayoutStatusBreakdownRow[] = Array.from(payoutBuckets.entries())
    .map(([status, v]) => ({ status, orderCount: v.orderCount, sellerNetUsd: round2(v.sellerNetUsd) }))
    .sort((a, b) => b.orderCount - a.orderCount);

  const companyNetRevenueUsd = platformRevenueUsd - unrecoveredLabelCostUsd;

  return {
    rangeKey,
    rangeStart: rangeStart ? rangeStart.toISOString() : null,
    generatedAt: new Date().toISOString(),
    paidOrderCount,
    refundedOrderCount,
    grossSalesUsd: round2(grossSalesUsd),
    gmvUsd: round2(gmvUsd),
    platformRevenueUsd: round2(platformRevenueUsd),
    processingFeesUsd: round2(processingFeesUsd),
    salesTaxCollectedUsd: round2(salesTaxCollectedUsd),
    shippingCollectedUsd: round2(shippingCollectedUsd),
    shippingLabelCostUsd: round2(shippingLabelCostUsd),
    sellerNetUsd: round2(sellerNetUsd),
    payoutStatusBreakdown,
    refundAdjustments: {
      refundedOrderCount,
      chargebackOrderCount,
      refundedGrossUsd: round2(refundedGrossUsd),
      taxReversedUsd: round2(taxReversedUsd),
      platformFeeOnRefundedOrdersUsd: round2(platformFeeOnRefundedOrdersUsd),
    },
    platformFeeRetainedOnRefunds: true,
    companyNetRevenueUsd: round2(companyNetRevenueUsd),
    assumptions: [
      "Orders are grouped by creation date (createdAt), not by payment or refund event date.",
      "Platform fees use the same tiered/flat resolver as the seller sales report (marketplace flat % vs live-show GMV tiers).",
      "Stripe processing fees on marketplace sales are absorbed by sellers on Connect (stored Order.stripeProcessingFeeCents, else 2.9%+$0.30). Official/company listings do not pass processing through — seller net and processingFeesUsd both use $0 for those rows.",
      "ASSUMPTION FLAGGED FOR REVIEW: platform application fees are currently kept in full even when an order is fully refunded or charged back — only the seller's transferred share is clawed back (reverse_transfer). If the business intends to also refund the platform's own fee, add refund_application_fee: true to the Stripe refund calls.",
      "Seller net excludes tips (item price + shipping − platform fee − payout reserve − Get Vaulted label cost when a platform label was purchased), matching the seller-facing Sales report's payout estimate for the same order.",
      "Shipping label cost is recovered from the seller via Stripe transfer reversal when a Get Vaulted label is purchased. External (non-platform) shipping leaves shipping with the seller and is not deducted here. Label cost still appears in shippingLabelCostUsd for carrier spend tracking; company net treats recovered label costs as offset when reversal succeeds.",
      "Shipping label cost counts every order with a purchased label in range, including later-refunded orders, since the carrier cost is not recovered on refund.",
      "Refund/dispute adjustments include both buyer-refunded orders and lost Stripe disputes (chargebacks); live-show GMV is rolled back for both so later sales in the same show aren't taxed at an incorrectly low fee tier.",
      "ASSUMPTION FLAGGED FOR REVIEW: payoutReserveAmountCents is bookkeeping-only. It is computed after the seller's share has already moved via a Stripe Connect destination-charge transfer, so it reduces the seller-net figure shown here and in seller reports but does NOT actually hold back any real Stripe balance. Treat the 'reserve' as a soft risk signal, not a funded holdback, unless the payment architecture changes to separate charges and transfers.",
      "Layaway purchases collect sales tax once, in full, with the initial deposit — calculated on the full item + shipping amount (Stripe Tax Calculation API), added as an explicit 'Sales tax' checkout line item, and persisted on Order.taxAmountCents/taxUsd at deposit-paid time. Later installments never add further tax. If the buyer defaults, the tax is refunded in full separately from the forfeited (non-refundable) deposit principal — see `defaultLayawayPlan`. A completed layaway therefore reconciles identically to a normal taxable sale.",
      "Every completed sale (marketplace, live, and layaway) records a Stripe Tax transaction via stripe.tax.transactions.createFromCalculation after finalization (see `recordStripeTaxTransaction`), so Stripe's own tax reporting/filing dashboard reflects the same transactions as this reconciliation report. This call is best-effort/fire-and-forget: a failure here does not affect what was actually charged to the buyer or held in this app's own ledger, only Stripe's downstream reporting, and is logged for follow-up if it fails.",
      "Partial refunds initiated directly in the Stripe Dashboard (outside this app's own refund flow) are unsupported for ordinary orders and flag payoutStatus as manual_review so payout is held pending human reconciliation. The one deliberate exception is a layaway default's tax-only refund (the deposit charge is intentionally left partially refunded — tax returned, principal forfeited); the webhook recognizes this via the layaway's own status and does not flag it for manual review.",
    ],
  };
}
