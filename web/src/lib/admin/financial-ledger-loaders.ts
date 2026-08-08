import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { ensureLiveShowFeeCache } from "@/services/live-show-fee-settings";
import { ensureMarketplacePlatformFeeCache } from "@/services/platform-fee-settings";
import { effectiveSellerPlatformFeePercentOverride } from "@/services/seller-platform-fee-override";
import {
  buildOrderFinancialLedger,
  centsToUsd,
  type OrderFinancialLedger,
  type OrderLedgerInput,
} from "@/lib/admin/order-financial-ledger";
import {
  ledgerRangeToLegacy,
  prismaCreatedAtFilter,
  prismaSaleAtFilter,
  resolveLedgerDateRange,
  type LedgerRangeKey,
} from "@/lib/admin/financial-ledger-range";
import { loadStripeBalanceReconciliationReport } from "@/lib/admin/stripe-balance-reconciliation";
import { loadAdminShippingReconciliationReport } from "@/lib/admin/shipping-reconciliation";

const PAID_STATUSES = ["paid", "layaway_completed", "refunded", "chargeback"] as const;

const orderLedgerSelect = {
  id: true,
  createdAt: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  payoutStatus: true,
  shippingStatus: true,
  itemPriceUsd: true,
  shippingPriceUsd: true,
  shippingChargedCents: true,
  taxUsd: true,
  taxAmountCents: true,
  taxRefundedCents: true,
  totalUsd: true,
  referralCreditAppliedUsd: true,
  stripePaymentIntentId: true,
  stripeChargeId: true,
  stripeBalanceTransactionId: true,
  stripeProcessingFeeCents: true,
  stripeApplicationFeeCents: true,
  stripeNetCents: true,
  stripeTransferId: true,
  sellerPayoutProcessor: true,
  processorTransferId: true,
  paypalPayoutFeeCents: true,
  paypalPayoutStatus: true,
  stripeTaxCalculationId: true,
  stripeTaxTransactionId: true,
  stripeTaxTransactionReversalId: true,
  taxJurisdictionState: true,
  shippingLabelCostCents: true,
  shippingLabelCostReversedCents: true,
  shippingLabelCostReversalId: true,
  shippoTransactionId: true,
  shippoShipmentId: true,
  trackingNumber: true,
  labelCreatedAt: true,
  estimatedLabelCostCents: true,
  payoutReserveAmountCents: true,
  liveShippingSessionId: true,
  buyer: { select: { username: true } },
  seller: {
    select: {
      username: true,
      sellerPlatformFeePercentOverride: true,
      sellerPlatformFeeOverrideExpiresAt: true,
    },
  },
  listing: { select: { title: true, isCompanyListing: true, buyingFormat: true } },
  liveShippingSession: {
    select: {
      liveShowId: true,
      estimatedLabelCostCents: true,
      finalLabelCostCents: true,
      liveShow: {
        select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true },
      },
      packages: { select: { labelCostCents: true, orderId: true } },
      _count: { select: { orders: true } },
    },
  },
  shipmentPackages: { select: { labelCostCents: true } },
  labelFinances: {
    select: {
      id: true,
      orderId: true,
      shippoTransactionId: true,
      shippoShipmentId: true,
      labelCostCents: true,
      purpose: true,
      replacesShippoTransactionId: true,
      status: true,
      sellerClawbackCents: true,
      sellerClawbackReversalId: true,
      sellerCreditCents: true,
      sellerCreditTransferId: true,
      clawbackIdempotencyKey: true,
      creditIdempotencyKey: true,
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderLedgerSelect }>;

function toLedgerInput(o: OrderRow): OrderLedgerInput {
  const liveShow = o.liveShippingSession?.liveShow ?? null;
  const sessionOrderCount = o.liveShippingSession?._count?.orders ?? 0;
  const ownsBundledLabelCost =
    (o.shippingLabelCostCents != null && o.shippingLabelCostCents > 0) || o.labelFinances.length > 0;
  // Bundled live sessions put the same package label on every sibling in the UI. Only the debit
  // order (or the order with label-finance rows) owns that cost for reconciliation — otherwise
  // every sibling looks like a -$6 exception and ops may retry clawback multiple times.
  const rawPackageLabel =
    o.shipmentPackages.find((p) => p.labelCostCents != null)?.labelCostCents ??
    o.liveShippingSession?.packages.find((p) => p.labelCostCents != null)?.labelCostCents ??
    null;
  const packageLabel =
    sessionOrderCount > 1 && !ownsBundledLabelCost && o.shippingLabelCostCents === 0
      ? null
      : rawPackageLabel;
  const override = effectiveSellerPlatformFeePercentOverride({
    percent: o.seller.sellerPlatformFeePercentOverride,
    expiresAt: o.seller.sellerPlatformFeeOverrideExpiresAt,
  });
  return {
    id: o.id,
    createdAt: o.createdAt,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    payoutStatus: o.payoutStatus,
    shippingStatus: o.shippingStatus,
    itemPriceUsd: o.itemPriceUsd,
    shippingPriceUsd: o.shippingPriceUsd,
    shippingChargedCents: o.shippingChargedCents,
    taxUsd: o.taxUsd,
    taxAmountCents: o.taxAmountCents,
    taxRefundedCents: o.taxRefundedCents,
    totalUsd: o.totalUsd,
    referralCreditAppliedUsd: o.referralCreditAppliedUsd,
    stripePaymentIntentId: o.stripePaymentIntentId,
    stripeChargeId: o.stripeChargeId,
    stripeBalanceTransactionId: o.stripeBalanceTransactionId,
    stripeProcessingFeeCents: o.stripeProcessingFeeCents,
    stripeApplicationFeeCents: o.stripeApplicationFeeCents,
    stripeNetCents: o.stripeNetCents,
    stripeTransferId: o.stripeTransferId,
    sellerPayoutProcessor: o.sellerPayoutProcessor,
    processorTransferId: o.processorTransferId,
    paypalPayoutFeeCents: o.paypalPayoutFeeCents,
    paypalPayoutStatus: o.paypalPayoutStatus,
    stripeTaxCalculationId: o.stripeTaxCalculationId,
    stripeTaxTransactionId: o.stripeTaxTransactionId,
    stripeTaxTransactionReversalId: o.stripeTaxTransactionReversalId,
    taxJurisdictionState: o.taxJurisdictionState,
    shippingLabelCostCents: o.shippingLabelCostCents,
    shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
    shippingLabelCostReversalId: o.shippingLabelCostReversalId,
    shippoTransactionId: o.shippoTransactionId,
    shippoShipmentId: o.shippoShipmentId,
    trackingNumber: o.trackingNumber,
    labelCreatedAt: o.labelCreatedAt,
    estimatedLabelCostCents: o.estimatedLabelCostCents,
    payoutReserveAmountCents: o.payoutReserveAmountCents,
    isCompanyListing: Boolean(o.listing.isCompanyListing),
    buyingFormat: o.listing.buyingFormat,
    liveShowId: o.liveShippingSession?.liveShowId ?? null,
    liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(liveShow),
    liveShowStatus: liveShow?.status ?? null,
    sellerPlatformFeePercentOverride: override,
    buyerUsername: o.buyer.username,
    sellerUsername: o.seller.username,
    listingTitle: o.listing.title,
    packageLabelCostCents: packageLabel,
    labelFinances: o.labelFinances,
  };
}

export type FinancialLedgerFilters = {
  range?: string | null;
  from?: string | null;
  to?: string | null;
  orderId?: string | null;
  buyer?: string | null;
  seller?: string | null;
  showId?: string | null;
  purchaseType?: "live" | "marketplace" | null;
  paymentStatus?: string | null;
  /** Comma-separated payment statuses, e.g. "refunded,chargeback". */
  paymentStatuses?: string | null;
  fulfillmentStatus?: string | null;
  payoutStatus?: string | null;
  /** Comma-separated payout statuses, e.g. "held,blocked,manual_review". */
  payoutStatuses?: string | null;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  transferId?: string | null;
  transferReversalId?: string | null;
  trackingNumber?: string | null;
  reconciliationStatus?: string | null;
  /** Only orders with a purchased Shippo label (actual cost or shippo tx). */
  hasLabel?: string | null;
  /** Only orders with unrecovered label cost (cost > deduction). */
  unrecoveredLabel?: string | null;
  /** Only orders with sales tax > 0. */
  hasTax?: string | null;
  page?: number;
  pageSize?: number;
};

async function loadOrdersForLedger(filters: FinancialLedgerFilters): Promise<OrderRow[]> {
  const range = resolveLedgerDateRange(filters);
  const saleAt = prismaSaleAtFilter(range);

  const where: Prisma.OrderWhereInput = {
    ...saleAt,
    paymentStatus: { in: [...PAID_STATUSES] },
  };

  if (filters.orderId?.trim()) where.id = filters.orderId.trim();
  if (filters.paymentStatuses?.trim()) {
    const list = filters.paymentStatuses.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length) where.paymentStatus = { in: list };
  } else if (filters.paymentStatus?.trim()) {
    where.paymentStatus = filters.paymentStatus.trim();
  }
  if (filters.fulfillmentStatus?.trim()) where.fulfillmentStatus = filters.fulfillmentStatus.trim();
  if (filters.payoutStatuses?.trim()) {
    const list = filters.payoutStatuses.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length) where.payoutStatus = { in: list as never[] };
  } else if (filters.payoutStatus?.trim()) {
    where.payoutStatus = filters.payoutStatus.trim() as never;
  }
  const andParts: Prisma.OrderWhereInput[] = [];
  if (filters.hasLabel === "1") {
    andParts.push({
      OR: [
        { shippingLabelCostCents: { gt: 0 } },
        { shippoTransactionId: { not: null } },
        { labelCreatedAt: { not: null } },
      ],
    });
  }
  if (filters.hasTax === "1") {
    andParts.push({ OR: [{ taxAmountCents: { gt: 0 } }, { taxUsd: { gt: 0 } }] });
  }
  if (filters.unrecoveredLabel === "1") {
    andParts.push({ shippingLabelCostCents: { gt: 0 } });
  }
  if (andParts.length) where.AND = andParts;
  if (filters.paymentIntentId?.trim()) where.stripePaymentIntentId = filters.paymentIntentId.trim();
  if (filters.chargeId?.trim()) where.stripeChargeId = filters.chargeId.trim();
  if (filters.transferId?.trim()) where.stripeTransferId = filters.transferId.trim();
  if (filters.transferReversalId?.trim()) {
    where.shippingLabelCostReversalId = filters.transferReversalId.trim();
  }
  if (filters.trackingNumber?.trim()) where.trackingNumber = filters.trackingNumber.trim();
  if (filters.showId?.trim()) {
    where.liveShippingSession = { liveShowId: filters.showId.trim() };
  }
  if (filters.purchaseType === "live") {
    where.liveShippingSessionId = { not: null };
  } else if (filters.purchaseType === "marketplace") {
    where.liveShippingSessionId = null;
  }
  if (filters.buyer?.trim()) {
    const q = filters.buyer.trim();
    where.buyer = {
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { id: q },
      ],
    };
  }
  if (filters.seller?.trim()) {
    const q = filters.seller.trim();
    where.seller = {
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { id: q },
      ],
    };
  }

  return prisma.order.findMany({
    where,
    select: orderLedgerSelect,
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
}

export async function loadFinancialLedgerOrders(filters: FinancialLedgerFilters = {}): Promise<{
  rangeKey: LedgerRangeKey;
  rangeStart: string | null;
  rangeEnd: string | null;
  generatedAt: string;
  totalCount: number;
  page: number;
  pageSize: number;
  rows: OrderFinancialLedger[];
}> {
  await Promise.all([ensureMarketplacePlatformFeeCache(true), ensureLiveShowFeeCache(true)]);
  const range = resolveLedgerDateRange(filters);
  const orders = await loadOrdersForLedger(filters);
  let rows = orders.map((o) => buildOrderFinancialLedger(toLedgerInput(o)));

  if (filters.reconciliationStatus?.trim()) {
    const st = filters.reconciliationStatus.trim();
    rows = rows.filter((r) => r.reconciliationStatus === st);
  }
  if (filters.unrecoveredLabel === "1") {
    rows = rows.filter(
      (r) =>
        (r.actualLabelCostCents.cents ?? 0) > 0 &&
        r.sellerLabelDeductionCents !== (r.actualLabelCostCents.cents ?? 0),
    );
  }

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
  const start = (page - 1) * pageSize;

  return {
    rangeKey: range.rangeKey,
    rangeStart: range.rangeStart?.toISOString() ?? null,
    rangeEnd: range.rangeEnd?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
    totalCount: rows.length,
    page,
    pageSize,
    rows: rows.slice(start, start + pageSize),
  };
}

export type FinancialOverviewReport = {
  rangeKey: LedgerRangeKey;
  rangeStart: string | null;
  rangeEnd: string | null;
  generatedAt: string;
  revenue: {
    gmvUsd: number;
    itemSalesUsd: number;
    buyerShippingCollectedUsd: number;
    platformFeesEarnedUsd: number;
    tipsRetainedUsd: number;
    tradeFeesUsd: number;
    otherPlatformRevenueUsd: number;
  };
  passThrough: {
    salesTaxCollectedUsd: number;
    sellerOwnedProceedsUsd: number;
    buyerShippingCreditedToSellersUsd: number;
  };
  stripeCosts: {
    paymentProcessingFeesUsd: number;
    paymentProcessingFeesActualUsd: number;
    paymentProcessingFeesEstimatedUsd: number;
    taxApiCalculationFeesUsd: number;
    taxApiTransactionFeesUsd: number;
    connectFeesUsd: number;
    payoutFeesUsd: number;
    disputeFeesUsd: number;
    otherStripeFeesUsd: number;
  };
  shipping: {
    actualLabelCostUsd: number;
    sellerDeductionsUsd: number;
    unrecoveredLabelCostUsd: number;
    voidedLabelCreditsUsd: number;
    shippingVarianceUsd: number;
  };
  refundsAndRisk: {
    buyerRefundsUsd: number;
    applicationFeeRefundsUsd: number;
    transferReversalsUsd: number;
    disputesCount: number;
    chargebacksUsd: number;
    chargebackLossesUsd: number;
    frozenSellerFundsUsd: number;
  };
  final: {
    grossPlatformRevenueUsd: number;
    platformOperatingCostsUsd: number;
    netPlatformRevenueUsd: number;
    currentTaxLiabilityUsd: number;
    unreconciledAmountUsd: number;
    exceptionOrderCount: number;
    estimatedFeeOrderCount: number;
  };
  formulas: Record<string, string>;
};

export async function loadFinancialOverview(filters: FinancialLedgerFilters = {}): Promise<FinancialOverviewReport> {
  await Promise.all([ensureMarketplacePlatformFeeCache(true), ensureLiveShowFeeCache(true)]);
  const range = resolveLedgerDateRange(filters);
  const orders = await loadOrdersForLedger(filters);
  const ledgers = orders.map((o) => buildOrderFinancialLedger(toLedgerInput(o)));

  let gmvUsd = 0;
  let itemSalesUsd = 0;
  let buyerShippingCollectedUsd = 0;
  let platformFeesEarnedUsd = 0;
  let salesTaxCollectedUsd = 0;
  let sellerOwnedProceedsUsd = 0;
  let processingActualUsd = 0;
  let processingEstimatedUsd = 0;
  let actualLabelCostUsd = 0;
  let sellerDeductionsUsd = 0;
  let buyerRefundsUsd = 0;
  let chargebacksUsd = 0;
  let taxLiabilityUsd = 0;
  let unreconciledAmountUsd = 0;
  let exceptionOrderCount = 0;
  let estimatedFeeOrderCount = 0;
  let frozenSellerFundsUsd = 0;

  for (const r of ledgers) {
    if (r.paymentStatus === "paid" || r.paymentStatus === "layaway_completed") {
      gmvUsd += centsToUsd(r.customerTotalCents);
      itemSalesUsd += centsToUsd(r.itemSubtotalCents);
      buyerShippingCollectedUsd += centsToUsd(r.buyerShippingCents);
      platformFeesEarnedUsd += centsToUsd(r.platformEarnedRevenueCents);
      salesTaxCollectedUsd += centsToUsd(r.salesTaxCents);
      sellerOwnedProceedsUsd += centsToUsd(r.sellerFinalNetCents.cents);
      taxLiabilityUsd += centsToUsd(r.platformHeldTaxCents);
      if (r.stripeProcessingFeeCents.source === "actual") {
        processingActualUsd += centsToUsd(r.stripeProcessingFeeCents.cents);
      } else {
        processingEstimatedUsd += centsToUsd(r.stripeProcessingFeeCents.cents);
        estimatedFeeOrderCount += 1;
      }
    }
    if (r.actualLabelCostCents.cents != null) {
      actualLabelCostUsd += centsToUsd(r.actualLabelCostCents.cents);
    }
    sellerDeductionsUsd += centsToUsd(r.sellerLabelDeductionCents);
    if (r.paymentStatus === "refunded") buyerRefundsUsd += centsToUsd(r.refundTotalCents);
    if (r.paymentStatus === "chargeback") chargebacksUsd += centsToUsd(r.disputeLossCents);
    if (r.reconciliationStatus === "exception" || Math.abs(r.finalVarianceCents) >= 1) {
      exceptionOrderCount += 1;
      unreconciledAmountUsd += Math.abs(centsToUsd(r.finalVarianceCents));
    }
    if (r.payoutStatus === "held" || r.payoutStatus === "blocked" || r.payoutStatus === "manual_review") {
      frozenSellerFundsUsd += centsToUsd(r.sellerFinalNetCents.cents);
    }
  }

  const unrecoveredLabelCostUsd = Math.max(0, actualLabelCostUsd - sellerDeductionsUsd);
  const shippingVarianceUsd = sellerDeductionsUsd - actualLabelCostUsd;

  // Tips: platform-retained tips aren't separately stored as platform keep on LiveTip —
  // tips go to sellers today. Report 0 with explicit note in formulas.
  const tipsRetainedUsd = 0;
  const tradeFeesUsd = 0;

  const legacy = ledgerRangeToLegacy(range.rangeKey);
  let taxApiCalculationFeesUsd = 0;
  let taxApiTransactionFeesUsd = 0;
  let applicationFeeRefundsUsd = 0;
  let transferReversalsUsd = 0;
  let disputeFeesUsd = 0;
  try {
    const stripeReport = await loadStripeBalanceReconciliationReport(legacy, {
      orderId: filters.orderId ?? undefined,
    });
    taxApiCalculationFeesUsd = stripeReport.taxApiCalculationCostUsd;
    taxApiTransactionFeesUsd = stripeReport.taxApiTransactionCostUsd;
    applicationFeeRefundsUsd = stripeReport.applicationFeeRefundsUsd;
    transferReversalsUsd = stripeReport.transferRefundsUsd;
  } catch {
    /* Stripe optional */
  }

  const grossPlatformRevenueUsd = platformFeesEarnedUsd + tipsRetainedUsd + tradeFeesUsd;
  // Seller-paid processing is NOT a platform operating cost when reimbursement succeeded.
  // Platform absorbs Tax API costs + unrecovered labels + chargeback losses.
  const platformOperatingCostsUsd =
    taxApiCalculationFeesUsd +
    taxApiTransactionFeesUsd +
    unrecoveredLabelCostUsd +
    disputeFeesUsd +
    chargebacksUsd;
  const netPlatformRevenueUsd = grossPlatformRevenueUsd - platformOperatingCostsUsd;

  return {
    rangeKey: range.rangeKey,
    rangeStart: range.rangeStart?.toISOString() ?? null,
    rangeEnd: range.rangeEnd?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
    revenue: {
      gmvUsd: round2(gmvUsd),
      itemSalesUsd: round2(itemSalesUsd),
      buyerShippingCollectedUsd: round2(buyerShippingCollectedUsd),
      platformFeesEarnedUsd: round2(platformFeesEarnedUsd),
      tipsRetainedUsd,
      tradeFeesUsd,
      otherPlatformRevenueUsd: 0,
    },
    passThrough: {
      salesTaxCollectedUsd: round2(salesTaxCollectedUsd),
      sellerOwnedProceedsUsd: round2(sellerOwnedProceedsUsd),
      buyerShippingCreditedToSellersUsd: round2(buyerShippingCollectedUsd),
    },
    stripeCosts: {
      paymentProcessingFeesUsd: round2(processingActualUsd + processingEstimatedUsd),
      paymentProcessingFeesActualUsd: round2(processingActualUsd),
      paymentProcessingFeesEstimatedUsd: round2(processingEstimatedUsd),
      taxApiCalculationFeesUsd: round2(taxApiCalculationFeesUsd),
      taxApiTransactionFeesUsd: round2(taxApiTransactionFeesUsd),
      connectFeesUsd: 0,
      payoutFeesUsd: 0,
      disputeFeesUsd: round2(disputeFeesUsd),
      otherStripeFeesUsd: 0,
    },
    shipping: {
      actualLabelCostUsd: round2(actualLabelCostUsd),
      sellerDeductionsUsd: round2(sellerDeductionsUsd),
      unrecoveredLabelCostUsd: round2(unrecoveredLabelCostUsd),
      voidedLabelCreditsUsd: 0,
      shippingVarianceUsd: round2(shippingVarianceUsd),
    },
    refundsAndRisk: {
      buyerRefundsUsd: round2(buyerRefundsUsd),
      applicationFeeRefundsUsd: round2(applicationFeeRefundsUsd),
      transferReversalsUsd: round2(transferReversalsUsd),
      disputesCount: ledgers.filter((r) => r.paymentStatus === "chargeback").length,
      chargebacksUsd: round2(chargebacksUsd),
      chargebackLossesUsd: round2(chargebacksUsd),
      frozenSellerFundsUsd: round2(frozenSellerFundsUsd),
    },
    final: {
      grossPlatformRevenueUsd: round2(grossPlatformRevenueUsd),
      platformOperatingCostsUsd: round2(platformOperatingCostsUsd),
      netPlatformRevenueUsd: round2(netPlatformRevenueUsd),
      currentTaxLiabilityUsd: round2(taxLiabilityUsd),
      unreconciledAmountUsd: round2(unreconciledAmountUsd),
      exceptionOrderCount,
      estimatedFeeOrderCount,
    },
    formulas: {
      grossPlatformRevenue: "platformFeeEarned + platformRetainedTips + tradeFees (tax/shipping/seller proceeds excluded)",
      platformOperatingCosts:
        "StripeTaxApiCosts + unrecoveredShippingLabelCosts + disputeFees + chargebackLosses (seller-paid card fees excluded)",
      netPlatformRevenue: "grossPlatformRevenue − platformOperatingCosts",
      platformShippingVariance: "sellerLabelDeduction − actualLabelCost",
      salesTaxLiability: "salesTaxCollected − taxRefunded (liability, not revenue)",
      tipsNote: "Live tips currently transfer to sellers — tipsRetainedUsd is 0 until platform tip retention is stored",
      processingNote:
        "Card processing is seller-absorbed on Connect; actual BT fees shown separately from Stripe Tax API product costs",
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type LedgerException = {
  id: string;
  severity: "critical" | "warning" | "info";
  type: string;
  orderId: string | null;
  sellerUsername: string | null;
  amountAtRiskUsd: number;
  reason: string;
  createdAt: string;
  recommendedAction: string;
  resolutionStatus: "open";
};

export async function loadFinancialExceptions(filters: FinancialLedgerFilters = {}): Promise<{
  rangeKey: LedgerRangeKey;
  generatedAt: string;
  exceptions: LedgerException[];
}> {
  await Promise.all([ensureMarketplacePlatformFeeCache(true), ensureLiveShowFeeCache(true)]);
  const range = resolveLedgerDateRange(filters);
  const orders = await loadOrdersForLedger(filters);
  const ledgers = orders.map((o) => buildOrderFinancialLedger(toLedgerInput(o)));
  const exceptions: LedgerException[] = [];

  for (const r of ledgers) {
    if (r.stripeProcessingFeeCents.source === "estimated" && (r.paymentStatus === "paid" || r.paymentStatus === "layaway_completed")) {
      exceptions.push({
        id: `${r.orderId}:stripe_fee_estimated`,
        severity: "warning",
        type: "processing_fee_estimated",
        orderId: r.orderId,
        sellerUsername: r.sellerUsername,
        amountAtRiskUsd: 0,
        reason: "stripeProcessingFeeCents is null — showing estimate",
        createdAt: r.createdAt,
        recommendedAction: "Run Stripe fee backfill (dry-run first)",
        resolutionStatus: "open",
      });
    }
    if (
      r.labelFinanceActionStatus === "seller_charge_required" ||
      r.labelFinanceActionStatus === "seller_credit_required" ||
      r.labelFinanceActionStatus === "overcharge" ||
      r.labelFinanceActionStatus === "waiting_for_shippo_refund"
    ) {
      const gap = (r.chargeableLabelCostCents ?? 0) - r.sellerLabelDeductionCents;
      const action =
        r.labelFinanceActionStatus === "waiting_for_shippo_refund"
          ? "Waiting for Shippo refund — do not mark reconciled"
          : r.labelFinanceActionStatus === "seller_charge_required"
            ? "Retry label-cost reversal for the missing chargeable label"
            : "Issue/record seller label credit for refunded replaced label";
      exceptions.push({
        id: `${r.orderId}:label_unrecovered`,
        severity: r.labelFinanceActionStatus === "waiting_for_shippo_refund" ? "warning" : gap > 0 ? "critical" : "warning",
        type:
          r.labelFinanceActionStatus === "waiting_for_shippo_refund"
            ? "shipping_deduction_mismatch"
            : gap > 0
              ? "label_purchased_seller_not_charged"
              : "shipping_deduction_mismatch",
        orderId: r.orderId,
        sellerUsername: r.sellerUsername,
        amountAtRiskUsd: Math.abs(centsToUsd(gap)),
        reason: r.varianceReasons.join("; ") || r.labelFinanceActionStatus,
        createdAt: r.createdAt,
        recommendedAction: action,
        resolutionStatus: "open",
      });
    }
    if (r.salesTaxCents > 0 && !r.stripeTaxTransactionId) {
      exceptions.push({
        id: `${r.orderId}:tax_tx_missing`,
        severity: "warning",
        type: "tax_transaction_missing",
        orderId: r.orderId,
        sellerUsername: r.sellerUsername,
        amountAtRiskUsd: centsToUsd(r.salesTaxCents),
        reason: "Tax collected but stripeTaxTransactionId missing",
        createdAt: r.createdAt,
        recommendedAction: "Re-run Stripe Tax createFromCalculation for this order",
        resolutionStatus: "open",
      });
    }
    if (r.paymentStatus === "chargeback") {
      exceptions.push({
        id: `${r.orderId}:chargeback`,
        severity: "critical",
        type: "dispute_or_chargeback_unrecovered",
        orderId: r.orderId,
        sellerUsername: r.sellerUsername,
        amountAtRiskUsd: centsToUsd(r.disputeLossCents),
        reason: "Order paymentStatus=chargeback",
        createdAt: r.createdAt,
        recommendedAction: "Confirm seller transfer reverse + evidence package",
        resolutionStatus: "open",
      });
    }
    if (Math.abs(r.finalVarianceCents) >= 1 && r.reconciliationStatus === "exception") {
      exceptions.push({
        id: `${r.orderId}:variance`,
        severity: "warning",
        type: "non_zero_order_variance",
        orderId: r.orderId,
        sellerUsername: r.sellerUsername,
        amountAtRiskUsd: Math.abs(centsToUsd(r.finalVarianceCents)),
        reason: `Variance ${r.finalVarianceCents}¢ — ${r.varianceReasons.join("; ")}`,
        createdAt: r.createdAt,
        recommendedAction: "Open order ledger and resolve flagged components",
        resolutionStatus: "open",
      });
    }
  }

  // Unmatched Stripe activity from balance report
  try {
    const stripeReport = await loadStripeBalanceReconciliationReport(ledgerRangeToLegacy(range.rangeKey));
    for (const row of stripeReport.rows) {
      if (row.unreconciled && !row.orderId) {
        exceptions.push({
          id: `bt:${row.balanceTransactionId ?? row.description ?? Math.random()}`,
          severity: "warning",
          type: "unmatched_stripe_activity",
          orderId: null,
          sellerUsername: null,
          amountAtRiskUsd: Math.abs(row.stripeAmountUsd),
          reason: `Unmatched Stripe ${row.category}: ${row.description ?? row.balanceTransactionId}`,
          createdAt: stripeReport.generatedAt,
          recommendedAction: "Match BT to order / investigate orphan fee",
          resolutionStatus: "open",
        });
      }
    }
  } catch {
    /* optional */
  }

  exceptions.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity] || b.amountAtRiskUsd - a.amountAtRiskUsd;
  });

  return {
    rangeKey: range.rangeKey,
    generatedAt: new Date().toISOString(),
    exceptions: exceptions.slice(0, 500),
  };
}

export async function loadFinancialTaxReport(filters: FinancialLedgerFilters = {}) {
  await ensureMarketplacePlatformFeeCache(true);
  const range = resolveLedgerDateRange(filters);
  const orders = await loadOrdersForLedger(filters);
  const rows = orders
    .filter((o) => (o.taxAmountCents ?? 0) > 0 || o.taxUsd > 0)
    .map((o) => {
      const taxCents = o.taxAmountCents > 0 ? o.taxAmountCents : Math.round(o.taxUsd * 100);
      const flags: string[] = [];
      if (taxCents > 0 && !o.stripeTaxTransactionId) flags.push("tax_tx_missing");
      if (o.stripeTaxCalculationId && !o.stripeTaxTransactionId) flags.push("calc_without_tx");
      if (o.paymentStatus === "refunded" && o.taxRefundedCents < taxCents) flags.push("refund_without_full_tax_reversal");
      return {
        orderId: o.id,
        taxableAmountCents: Math.round(o.itemPriceUsd * 100) + (o.shippingChargedCents ?? Math.round(o.shippingPriceUsd * 100)),
        shippingTaxableCents: o.shippingChargedCents ?? Math.round(o.shippingPriceUsd * 100),
        taxAmountCents: taxCents,
        taxRefundedCents: o.taxRefundedCents,
        jurisdiction: o.taxJurisdictionState,
        stripeTaxCalculationId: o.stripeTaxCalculationId,
        stripeTaxTransactionId: o.stripeTaxTransactionId,
        stripeTaxTransactionReversalId: o.stripeTaxTransactionReversalId,
        paymentStatus: o.paymentStatus,
        flags,
      };
    });

  const taxCollected = rows.reduce((s, r) => s + r.taxAmountCents, 0);
  const taxRefunded = rows.reduce((s, r) => s + r.taxRefundedCents, 0);

  let taxApiCalculationFeesUsd = 0;
  let taxApiTransactionFeesUsd = 0;
  try {
    const stripeReport = await loadStripeBalanceReconciliationReport(ledgerRangeToLegacy(range.rangeKey));
    taxApiCalculationFeesUsd = stripeReport.taxApiCalculationCostUsd;
    taxApiTransactionFeesUsd = stripeReport.taxApiTransactionCostUsd;
  } catch {
    /* optional */
  }

  return {
    rangeKey: range.rangeKey,
    rangeStart: range.rangeStart?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
    salesTaxCollectedUsd: centsToUsd(taxCollected),
    taxRefundedUsd: centsToUsd(taxRefunded),
    currentTaxLiabilityUsd: centsToUsd(taxCollected - taxRefunded),
    taxApiCalculationFeesUsd,
    taxApiTransactionFeesUsd,
    note: "Sales tax collected is a liability. Stripe Tax API fees are separate platform product costs.",
    rows,
  };
}

export async function loadFinancialRefundsDisputes(filters: FinancialLedgerFilters = {}) {
  const range = resolveLedgerDateRange(filters);
  const createdAt = prismaCreatedAtFilter(range);
  const orders = await prisma.order.findMany({
    where: {
      ...createdAt,
      paymentStatus: { in: ["refunded", "chargeback"] },
    },
    select: {
      id: true,
      createdAt: true,
      paymentStatus: true,
      totalUsd: true,
      taxAmountCents: true,
      taxRefundedCents: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
      stripePaymentIntentId: true,
      stripeTransferId: true,
      stripeApplicationFeeCents: true,
      buyer: { select: { username: true } },
      seller: { select: { username: true } },
      refundRequests: {
        select: { id: true, status: true, createdAt: true },
        take: 5,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const rows = orders.map((o) => {
    const flags: string[] = [];
    if (o.paymentStatus === "refunded" && !o.stripeTransferId) {
      flags.push("refund_without_known_transfer");
    }
    if (o.taxAmountCents > 0 && o.taxRefundedCents < o.taxAmountCents) {
      flags.push("tax_not_fully_reversed");
    }
    if ((o.shippingLabelCostCents ?? 0) > 0 && o.shippingLabelCostReversedCents > 0) {
      flags.push("label_cost_was_clawed_check_void_credit");
    }
    return {
      orderId: o.id,
      createdAt: o.createdAt.toISOString(),
      type: o.paymentStatus === "chargeback" ? "chargeback" : "buyer_refund",
      buyerUsername: o.buyer.username,
      sellerUsername: o.seller.username,
      buyerRefundUsd: o.totalUsd,
      taxRefundedCents: o.taxRefundedCents,
      taxAmountCents: o.taxAmountCents,
      labelCostCents: o.shippingLabelCostCents,
      labelDeductionCents: o.shippingLabelCostReversedCents,
      transferReversalId: o.shippingLabelCostReversalId,
      paymentIntentId: o.stripePaymentIntentId,
      transferId: o.stripeTransferId,
      applicationFeeCents: o.stripeApplicationFeeCents,
      refundRequestStatus: o.refundRequests[0]?.status ?? null,
      flags,
      platformUnrecoveredUsd:
        o.paymentStatus === "chargeback"
          ? o.totalUsd
          : Math.max(0, (o.taxAmountCents - o.taxRefundedCents) / 100),
    };
  });

  return {
    rangeKey: range.rangeKey,
    generatedAt: new Date().toISOString(),
    rows,
  };
}

/** Re-export shipping loader with ledger date mapping for the Shipping tab. */
export async function loadFinancialShippingTab(filters: FinancialLedgerFilters = {}) {
  const range = resolveLedgerDateRange(filters);
  return loadAdminShippingReconciliationReport(ledgerRangeToLegacy(range.rangeKey), {
    flaggedOnly: filters.reconciliationStatus === "exception",
  });
}
