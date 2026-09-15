import type Stripe from "stripe";
import { moneyFlowLog } from "@/lib/money-flow-log";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  estimatePlatformFeeUsd,
  estimateStripeProcessingFeeUsd,
  resolvePlatformFeePercentForSellerOrder,
} from "@/lib/seller-payout-estimate";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import {
  resolveReconciliationRangeStart,
  type ReconciliationRangeKey,
} from "@/lib/admin/admin-reconciliation";

export type StripeBtCategory =
  | "charge"
  | "payment"
  | "payment_refund"
  | "refund"
  | "application_fee"
  | "application_fee_refund"
  | "transfer"
  | "transfer_refund"
  | "stripe_fee"
  | "tax_fee"
  | "payout"
  | "adjustment"
  | "other";

export type StripeBalanceReconciliationRow = {
  orderId: string | null;
  sellerId: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  balanceTransactionId: string | null;
  transactionType: string;
  category: StripeBtCategory;
  description: string | null;
  internalGrossUsd: number | null;
  internalPlatformFeeUsd: number | null;
  internalTaxUsd: number | null;
  expectedPlatformNetUsd: number | null;
  stripeAmountUsd: number;
  stripeFeeUsd: number;
  stripeNetUsd: number;
  stripeProcessingFeeCents: number | null;
  stripeApplicationFeeCents: number | null;
  stripeTransferId: string | null;
  taxApiCostUsd: number;
  varianceUsd: number;
  unreconciled: boolean;
};

export type StripeBalanceReconciliationReport = {
  rangeKey: ReconciliationRangeKey;
  rangeStart: string | null;
  generatedAt: string;
  stripeConfigured: boolean;
  openingBalanceUsd: number | null;
  closingBalanceUsd: number | null;
  aggregateCreditsUsd: number;
  aggregateDebitsUsd: number;
  taxApiCalculationCostUsd: number;
  taxApiTransactionCostUsd: number;
  taxApiFeeOnBillingUsd: number;
  applicationFeesCollectedUsd: number;
  applicationFeeRefundsUsd: number;
  transferRefundsUsd: number;
  processingFeesActualUsd: number;
  orderRowCount: number;
  varianceRowCount: number;
  rows: StripeBalanceReconciliationRow[];
  assumptions: string[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function centsToUsd(cents: number): number {
  return round2(cents / 100);
}

/** Classify a Stripe BalanceTransaction for admin reporting. */
export function categorizeBalanceTransaction(bt: {
  type: string;
  reporting_category?: string | null;
  description?: string | null;
}): StripeBtCategory {
  const type = (bt.type ?? "").toLowerCase();
  const desc = (bt.description ?? "").toLowerCase();
  const reporting = (bt.reporting_category ?? "").toLowerCase();

  if (desc.includes("tax api calculation") || reporting.includes("tax_api_calculation")) {
    return "tax_fee";
  }
  if (desc.includes("tax api transaction") || reporting.includes("tax_api_transaction")) {
    return "tax_fee";
  }
  if (type === "stripe_fee" && (desc.includes("tax") || reporting.includes("tax"))) {
    return "tax_fee";
  }

  switch (type) {
    case "charge":
    case "payment":
      return type === "payment" ? "payment" : "charge";
    case "payment_refund":
      return "payment_refund";
    case "refund":
      return "refund";
    case "application_fee":
      return "application_fee";
    case "application_fee_refund":
      return "application_fee_refund";
    case "transfer":
      return "transfer";
    case "transfer_refund":
      return "transfer_refund";
    case "stripe_fee":
      return "stripe_fee";
    case "payout":
      return "payout";
    case "adjustment":
      return "adjustment";
    default:
      return "other";
  }
}

/**
 * Expected platform net for a destination-charge order (excludes Tax API usage bills).
 * Platform keeps application fee + tax collected − tax refunded − unrecovered label cost.
 * Card processing is intended seller-absorbed; variance vs estimate is surfaced separately.
 */
export function expectedPlatformNetUsd(args: {
  platformFeeUsd: number;
  taxUsd: number;
  taxRefundedUsd: number;
  unrecoveredLabelCostUsd: number;
  applicationFeeRefundedUsd?: number;
}): number {
  return round2(
    Math.max(0, args.platformFeeUsd) +
      Math.max(0, args.taxUsd) -
      Math.max(0, args.taxRefundedUsd) -
      Math.max(0, args.unrecoveredLabelCostUsd) -
      Math.max(0, args.applicationFeeRefundedUsd ?? 0),
  );
}

export function varianceUsd(expected: number | null, actual: number | null): number {
  if (expected == null || actual == null) return 0;
  return round2(actual - expected);
}

async function listBalanceTransactionsInRange(
  stripe: Stripe,
  createdGte: number | null,
  createdLt: number,
): Promise<Stripe.BalanceTransaction[]> {
  const out: Stripe.BalanceTransaction[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripe.balanceTransactions.list({
      limit: 100,
      ...(createdGte != null ? { created: { gte: createdGte, lt: createdLt } } : { created: { lt: createdLt } }),
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    out.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]!.id;
    if (out.length >= 5000) break;
  }
  return out;
}

export async function loadStripeBalanceReconciliationReport(
  rangeKey: ReconciliationRangeKey = "30d",
  filters?: {
    orderId?: string | null;
    paymentIntentId?: string | null;
    chargeId?: string | null;
    sellerId?: string | null;
  },
): Promise<StripeBalanceReconciliationReport> {
  const rangeStart = resolveReconciliationRangeStart(rangeKey);
  const generatedAt = new Date().toISOString();
  const assumptions = [
    "Stripe Balance Transactions are the financial source of truth for this report.",
    "Tax API Calculation/Transaction balance lines are Stripe product usage bills to Get Vaulted — not sales tax collected from buyers.",
    "Expected platform net = platform fee + tax collected − tax refunded − unrecovered label cost − application fee refunds (card fees intended seller-absorbed).",
    "Order rows without a matched Stripe charge are flagged unreconciled.",
    "Caps at 5,000 balance transactions and 10,000 orders per range.",
  ];

  if (!isStripeConfigured()) {
    return {
      rangeKey,
      rangeStart: rangeStart?.toISOString() ?? null,
      generatedAt,
      stripeConfigured: false,
      openingBalanceUsd: null,
      closingBalanceUsd: null,
      aggregateCreditsUsd: 0,
      aggregateDebitsUsd: 0,
      taxApiCalculationCostUsd: 0,
      taxApiTransactionCostUsd: 0,
      taxApiFeeOnBillingUsd: 0,
      applicationFeesCollectedUsd: 0,
      applicationFeeRefundsUsd: 0,
      transferRefundsUsd: 0,
      processingFeesActualUsd: 0,
      orderRowCount: 0,
      varianceRowCount: 0,
      rows: [],
      assumptions: [...assumptions, "Stripe is not configured in this environment."],
    };
  }

  const stripe = getStripe();
  const createdLt = Math.floor(Date.now() / 1000);
  const createdGte = rangeStart ? Math.floor(rangeStart.getTime() / 1000) : null;

  let balance: Stripe.Balance | null = null;
  try {
    balance = await stripe.balance.retrieve();
  } catch (e) {
    console.warn("[stripe-balance-reconciliation] balance.retrieve failed", e);
  }

  const available = (balance?.available ?? []).reduce((s, b) => s + (b.currency === "usd" ? b.amount : 0), 0);
  const pending = (balance?.pending ?? []).reduce((s, b) => s + (b.currency === "usd" ? b.amount : 0), 0);
  const closingBalanceUsd = centsToUsd(available + pending);

  const bts = await listBalanceTransactionsInRange(stripe, createdGte, createdLt);

  let aggregateCreditsUsd = 0;
  let aggregateDebitsUsd = 0;
  let taxApiCalculationCostUsd = 0;
  let taxApiTransactionCostUsd = 0;
  let taxApiFeeOnBillingUsd = 0;
  let applicationFeesCollectedUsd = 0;
  let applicationFeeRefundsUsd = 0;
  let transferRefundsUsd = 0;
  let processingFeesActualUsd = 0;

  const chargeIds = new Set<string>();
  const piIds = new Set<string>();

  for (const bt of bts) {
    const amountUsd = centsToUsd(bt.amount);
    if (bt.amount >= 0) aggregateCreditsUsd += amountUsd;
    else aggregateDebitsUsd += Math.abs(amountUsd);

    const cat = categorizeBalanceTransaction(bt);
    const desc = (bt.description ?? "").toLowerCase();

    if (cat === "tax_fee") {
      if (desc.includes("calculation")) taxApiCalculationCostUsd += Math.abs(amountUsd);
      else if (desc.includes("transaction")) taxApiTransactionCostUsd += Math.abs(amountUsd);
      else taxApiFeeOnBillingUsd += Math.abs(amountUsd);
      // Stripe often posts a separate stripe_fee line on Tax API billing — count fee field too.
      if (bt.fee > 0) taxApiFeeOnBillingUsd += centsToUsd(bt.fee);
    }
    if (cat === "application_fee") applicationFeesCollectedUsd += amountUsd;
    if (cat === "application_fee_refund") applicationFeeRefundsUsd += Math.abs(amountUsd);
    if (cat === "transfer_refund") transferRefundsUsd += amountUsd;
    if ((cat === "charge" || cat === "payment") && bt.fee > 0) {
      processingFeesActualUsd += centsToUsd(bt.fee);
    }

    const source = bt.source;
    if (typeof source === "string") {
      if (source.startsWith("ch_") || source.startsWith("py_")) chargeIds.add(source);
    }
  }

  const createdAtFilter = rangeStart ? { createdAt: { gte: rangeStart } } : {};
  const orders = await prisma.order.findMany({
    where: {
      ...createdAtFilter,
      ...(filters?.orderId ? { id: filters.orderId } : {}),
      ...(filters?.paymentIntentId ? { stripePaymentIntentId: filters.paymentIntentId } : {}),
      ...(filters?.chargeId ? { stripeChargeId: filters.chargeId } : {}),
      ...(filters?.sellerId ? { sellerId: filters.sellerId } : {}),
      paymentStatus: { in: ["paid", "layaway_completed", "refunded", "chargeback", "layaway_active"] },
    },
    select: {
      id: true,
      sellerId: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      taxAmountCents: true,
      taxRefundedCents: true,
      totalUsd: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      stripeBalanceTransactionId: true,
      stripeProcessingFeeCents: true,
      stripeApplicationFeeCents: true,
      stripeTransferId: true,
      stripeNetCents: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      listing: { select: { isCompanyListing: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
        },
      },
    },
    take: 10000,
    orderBy: { createdAt: "desc" },
  });

  for (const o of orders) {
    if (o.stripePaymentIntentId) piIds.add(o.stripePaymentIntentId);
    if (o.stripeChargeId) chargeIds.add(o.stripeChargeId);
  }

  const btById = new Map(bts.map((bt) => [bt.id, bt]));
  const rows: StripeBalanceReconciliationRow[] = [];

  for (const o of orders) {
    const liveShowId = o.liveShippingSession?.liveShowId ?? null;
    const liveShow = o.liveShippingSession?.liveShow ?? null;
    const feePct = resolvePlatformFeePercentForSellerOrder({
      isCompanyListing: Boolean(o.listing.isCompanyListing),
      liveShowId,
      liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(liveShow),
      orderItemPriceUsd: o.itemPriceUsd,
      orderPaymentStatus: o.paymentStatus,
    });
    const platformFeeUsd = o.listing.isCompanyListing
      ? 0
      : estimatePlatformFeeUsd({ itemPriceUsd: o.itemPriceUsd, platformFeePercent: feePct });
    const taxUsd = Math.max(0, o.taxAmountCents ?? 0) / 100 || Math.max(0, o.taxUsd);
    const taxRefundedUsd = Math.max(0, o.taxRefundedCents ?? 0) / 100;
    const labelUsd = Math.max(0, o.shippingLabelCostCents ?? 0) / 100;
    const reversedUsd = Math.max(0, o.shippingLabelCostReversedCents ?? 0) / 100;
    const unrecoveredLabelCostUsd = Math.max(0, labelUsd - reversedUsd);

    const expected = expectedPlatformNetUsd({
      platformFeeUsd,
      taxUsd,
      taxRefundedUsd,
      unrecoveredLabelCostUsd,
    });

    const bt =
      (o.stripeBalanceTransactionId ? btById.get(o.stripeBalanceTransactionId) : undefined) ?? null;
    const processingActual =
      o.stripeProcessingFeeCents != null
        ? o.stripeProcessingFeeCents
        : bt
          ? bt.fee
          : null;
    const appFeeActual =
      o.stripeApplicationFeeCents != null
        ? o.stripeApplicationFeeCents
        : null;

    // Actual platform residual from charge net is not equal to expected (transfer already left).
    // Compare expected platform fee+tax economics vs stored application fee + tax held.
    const actualPlatformNet =
      appFeeActual != null
        ? round2(centsToUsd(appFeeActual) + taxUsd - taxRefundedUsd - unrecoveredLabelCostUsd)
        : o.stripeNetCents != null && o.stripeApplicationFeeCents == null
          ? null
          : expected;

    const variance = varianceUsd(expected, actualPlatformNet ?? expected);
    const unreconciled =
      !o.stripeChargeId ||
      o.stripeProcessingFeeCents == null ||
      Math.abs(variance) >= 0.01 ||
      (processingActual != null &&
        Math.abs(
          centsToUsd(processingActual) - estimateStripeProcessingFeeUsd(o.totalUsd),
        ) >= 0.05);

    if (unreconciled && Math.abs(variance) >= 0.01) {
      moneyFlowLog("reconciliation_variance_detected", {
        orderId: o.id,
        expected,
        actual: actualPlatformNet,
        variance,
      });
    }

    rows.push({
      orderId: o.id,
      sellerId: o.sellerId,
      paymentIntentId: o.stripePaymentIntentId,
      chargeId: o.stripeChargeId,
      balanceTransactionId: o.stripeBalanceTransactionId ?? bt?.id ?? null,
      transactionType: o.paymentStatus,
      category: "charge",
      description: null,
      internalGrossUsd: round2(o.totalUsd),
      internalPlatformFeeUsd: round2(platformFeeUsd),
      internalTaxUsd: round2(taxUsd),
      expectedPlatformNetUsd: expected,
      stripeAmountUsd: bt ? centsToUsd(bt.amount) : 0,
      stripeFeeUsd: processingActual != null ? centsToUsd(processingActual) : bt ? centsToUsd(bt.fee) : 0,
      stripeNetUsd: o.stripeNetCents != null ? centsToUsd(o.stripeNetCents) : bt ? centsToUsd(bt.net) : 0,
      stripeProcessingFeeCents: processingActual,
      stripeApplicationFeeCents: appFeeActual,
      stripeTransferId: o.stripeTransferId,
      taxApiCostUsd: 0,
      varianceUsd: variance,
      unreconciled,
    });
  }

  // Orphan Tax API / app-fee balance lines without an order match
  for (const bt of bts) {
    const cat = categorizeBalanceTransaction(bt);
    if (cat !== "tax_fee" && cat !== "application_fee" && cat !== "application_fee_refund" && cat !== "transfer_refund") {
      continue;
    }
    rows.push({
      orderId: null,
      sellerId: null,
      paymentIntentId: null,
      chargeId: typeof bt.source === "string" ? bt.source : null,
      balanceTransactionId: bt.id,
      transactionType: bt.type,
      category: cat,
      description: bt.description ?? null,
      internalGrossUsd: null,
      internalPlatformFeeUsd: null,
      internalTaxUsd: null,
      expectedPlatformNetUsd: null,
      stripeAmountUsd: centsToUsd(bt.amount),
      stripeFeeUsd: centsToUsd(bt.fee),
      stripeNetUsd: centsToUsd(bt.net),
      stripeProcessingFeeCents: null,
      stripeApplicationFeeCents: cat === "application_fee" ? Math.abs(bt.amount) : null,
      stripeTransferId: null,
      taxApiCostUsd: cat === "tax_fee" ? Math.abs(centsToUsd(bt.amount)) : 0,
      varianceUsd: cat === "tax_fee" ? round2(-Math.abs(centsToUsd(bt.amount))) : 0,
      unreconciled: cat === "tax_fee",
    });
  }

  const filtered = rows.filter((r) => {
    if (filters?.orderId && r.orderId !== filters.orderId) return false;
    if (filters?.paymentIntentId && r.paymentIntentId !== filters.paymentIntentId) return false;
    if (filters?.chargeId && r.chargeId !== filters.chargeId) return false;
    if (filters?.sellerId && r.sellerId !== filters.sellerId) return false;
    return true;
  });

  const periodNet = aggregateCreditsUsd - aggregateDebitsUsd;
  const openingBalanceUsd =
    closingBalanceUsd != null ? round2(closingBalanceUsd - periodNet) : null;

  return {
    rangeKey,
    rangeStart: rangeStart?.toISOString() ?? null,
    generatedAt,
    stripeConfigured: true,
    openingBalanceUsd,
    closingBalanceUsd,
    aggregateCreditsUsd: round2(aggregateCreditsUsd),
    aggregateDebitsUsd: round2(aggregateDebitsUsd),
    taxApiCalculationCostUsd: round2(taxApiCalculationCostUsd),
    taxApiTransactionCostUsd: round2(taxApiTransactionCostUsd),
    taxApiFeeOnBillingUsd: round2(taxApiFeeOnBillingUsd),
    applicationFeesCollectedUsd: round2(applicationFeesCollectedUsd),
    applicationFeeRefundsUsd: round2(applicationFeeRefundsUsd),
    transferRefundsUsd: round2(transferRefundsUsd),
    processingFeesActualUsd: round2(processingFeesActualUsd),
    orderRowCount: orders.length,
    varianceRowCount: filtered.filter((r) => r.unreconciled || Math.abs(r.varianceUsd) >= 0.01).length,
    rows: filtered.slice(0, 500),
    assumptions,
  };
}
