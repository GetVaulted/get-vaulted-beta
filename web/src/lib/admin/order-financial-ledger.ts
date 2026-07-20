/**
 * Per-order financial ledger math for admin reconciliation.
 * Prefers stored Stripe/Shippo actuals; labels estimates explicitly.
 */

import {
  applicationFeeCentsFromSubtotalUsd,
  completedLiveShowGmvBeforeSale,
  resolvePlatformFeePercentForCheckout,
} from "@/lib/platform-fee-policy";
import { estimateStripeProcessingFeeCents } from "@/lib/seller-payout-estimate";
import { buyerShippingCentsFromOrder } from "@/lib/admin/shipping-reconciliation";
import {
  isLabelCostChargeable,
  labelHasSuccessfulClawback,
  labelNetSellerCents,
  resolveLabelFinanceActionStatus,
  summarizeLabelFinanceRows,
  type LabelFinanceActionStatus,
  type LabelFinanceRow,
} from "@/services/shipping/label-finance";

export type MoneySource = "actual" | "estimated" | "derived" | "unavailable";

export type LabeledCents = {
  cents: number | null;
  source: MoneySource;
  formula?: string;
};

export type OrderLedgerInput = {
  id: string;
  createdAt: Date;
  paymentStatus: string;
  fulfillmentStatus: string;
  payoutStatus: string;
  shippingStatus: string | null;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  shippingChargedCents: number | null;
  taxUsd: number;
  taxAmountCents: number;
  taxRefundedCents: number;
  totalUsd: number;
  referralCreditAppliedUsd: number;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  stripeBalanceTransactionId: string | null;
  stripeProcessingFeeCents: number | null;
  stripeApplicationFeeCents: number | null;
  stripeNetCents: number | null;
  stripeTransferId: string | null;
  stripeTaxCalculationId: string | null;
  stripeTaxTransactionId: string | null;
  stripeTaxTransactionReversalId: string | null;
  taxJurisdictionState: string | null;
  shippingLabelCostCents: number | null;
  shippingLabelCostReversedCents: number;
  shippingLabelCostReversalId: string | null;
  shippoTransactionId: string | null;
  shippoShipmentId: string | null;
  trackingNumber: string | null;
  labelCreatedAt: Date | null;
  estimatedLabelCostCents: number | null;
  payoutReserveAmountCents: number;
  isCompanyListing: boolean;
  buyingFormat: string | null;
  liveShowId: string | null;
  liveShowCompletedGmvUsd: number | null;
  liveShowStatus: string | null;
  sellerPlatformFeePercentOverride: number | null;
  buyerUsername: string | null;
  sellerUsername: string | null;
  listingTitle: string | null;
  /** Optional reconstructed transfer amount from Stripe (cents). */
  stripeTransferAmountCents?: number | null;
  /** Package label cost when order-level shippingLabelCostCents is null (bundled). */
  packageLabelCostCents?: number | null;
  /** Per-Shippo-transaction label finance rows (preferred over Order summary alone). */
  labelFinances?: LabelFinanceRow[] | null;
};

export type OrderLedgerLabelRow = {
  shippoTransactionId: string;
  shippoShipmentId: string | null;
  labelCostCents: number;
  purpose: string;
  status: string;
  sellerClawbackCents: number;
  sellerCreditCents: number;
  netSellerCents: number;
  sellerClawbackReversalId: string | null;
  sellerCreditTransferId: string | null;
  replacesShippoTransactionId: string | null;
  chargeable: boolean;
  clawbackMissing: boolean;
};

export type OrderFinancialLedger = {
  orderId: string;
  createdAt: string;
  buyerUsername: string | null;
  sellerUsername: string | null;
  listingTitle: string | null;
  purchaseType: "marketplace" | "live";
  buyingFormat: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  payoutStatus: string;

  // Buyer
  itemSubtotalCents: number;
  buyerShippingCents: number;
  salesTaxCents: number;
  discountCents: number;
  customerTotalCents: number;
  amountRefundedCents: number;
  finalBuyerPaidCents: number;

  // Fees
  platformFeePercent: number;
  platformFeeCents: LabeledCents;
  stripeProcessingFeeCents: LabeledCents;
  sellerTransferCents: LabeledCents;

  // Shipping label
  estimatedLabelCostCents: number | null;
  actualLabelCostCents: LabeledCents;
  /** Chargeable label cost (active + still-chargeable replaced labels). */
  chargeableLabelCostCents: number;
  /** Sum of successful seller clawbacks (gross). */
  grossSellerClawbackCents: number;
  /** Sum of successful seller label credits. */
  sellerLabelCreditCents: number;
  /** Net seller deduction = gross clawbacks − credits. */
  sellerLabelDeductionCents: number;
  shippingLabelCostReversalId: string | null;
  shippoTransactionId: string | null;
  shippoShipmentId: string | null;
  trackingNumber: string | null;
  platformShippingVarianceCents: number;
  labelFinanceRows: OrderLedgerLabelRow[];
  labelFinanceActionStatus: LabelFinanceActionStatus;
  /** True only when a specific chargeable label is missing a successful clawback. */
  needsLabelCostRetry: boolean;

  // Derived nets
  sellerFinalNetCents: LabeledCents;
  platformEarnedRevenueCents: number;
  platformHeldTaxCents: number;
  platformCashBeforeProcessingCents: LabeledCents;
  platformCashAfterProcessingCents: LabeledCents;
  disputeLossCents: number;
  refundTotalCents: number;
  finalVarianceCents: number;
  reconciliationStatus: "reconciled" | "estimated" | "exception" | "pending_label" | "refunded" | "chargeback";
  varianceReasons: string[];
  everythingReconciled: boolean;

  // Stripe IDs
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  stripeBalanceTransactionId: string | null;
  stripeTransferId: string | null;
  stripeTaxCalculationId: string | null;
  stripeTaxTransactionId: string | null;

  sections: {
    buyer: Record<string, LabeledCents | number | string | null>;
    stripe: Record<string, string | number | null>;
    seller: Record<string, LabeledCents | number | string | null>;
    platform: Record<string, LabeledCents | number | string | null>;
  };
};

function roundCents(n: number): number {
  return Math.max(0, Math.round(n));
}

function usdToCents(usd: number): number {
  return roundCents(Math.max(0, usd) * 100);
}

export function resolveActualLabelCostCents(input: {
  shippingLabelCostCents: number | null;
  packageLabelCostCents?: number | null;
}): number | null {
  if (input.shippingLabelCostCents != null && input.shippingLabelCostCents > 0) {
    return input.shippingLabelCostCents;
  }
  if (input.packageLabelCostCents != null && input.packageLabelCostCents > 0) {
    return input.packageLabelCostCents;
  }
  return input.shippingLabelCostCents;
}

export function resolveOrderPlatformFeePercent(input: {
  isCompanyListing: boolean;
  liveShowId: string | null;
  liveShowCompletedGmvUsd: number | null;
  liveShowStatus: string | null;
  itemPriceUsd: number;
  paymentStatus: string;
  sellerPlatformFeePercentOverride: number | null;
}): number {
  if (input.isCompanyListing) return 0;
  if (input.sellerPlatformFeePercentOverride != null) {
    return input.sellerPlatformFeePercentOverride;
  }
  if (!input.liveShowId) {
    return resolvePlatformFeePercentForCheckout({ isCompanyListing: false });
  }
  const gmv = input.liveShowCompletedGmvUsd ?? 0;
  const gmvForTier =
    input.paymentStatus === "paid" || input.paymentStatus === "layaway_completed"
      ? completedLiveShowGmvBeforeSale(gmv, input.itemPriceUsd)
      : gmv;
  return resolvePlatformFeePercentForCheckout({
    isCompanyListing: false,
    liveRoomId: input.liveShowId,
    completedLiveShowGmvUsd: gmvForTier,
  });
}

/**
 * Build the full per-order ledger used by Orders / Overview / Exceptions tabs.
 */
export function buildOrderFinancialLedger(input: OrderLedgerInput): OrderFinancialLedger {
  const itemSubtotalCents = usdToCents(input.itemPriceUsd);
  const buyerShippingCents = buyerShippingCentsFromOrder(input);
  const salesTaxCents =
    input.taxAmountCents > 0 ? Math.max(0, input.taxAmountCents) : usdToCents(input.taxUsd);
  const discountCents = usdToCents(input.referralCreditAppliedUsd);
  const customerTotalCents = usdToCents(input.totalUsd);
  const taxRefundedCents = Math.max(0, input.taxRefundedCents);
  const isRefunded = input.paymentStatus === "refunded";
  const isChargeback = input.paymentStatus === "chargeback";
  const amountRefundedCents = isRefunded || isChargeback ? customerTotalCents : 0;
  const finalBuyerPaidCents = Math.max(0, customerTotalCents - amountRefundedCents);

  const platformFeePercent = resolveOrderPlatformFeePercent(input);
  // Platform fee is always the order fee on item subtotal — never Stripe application_fee_amount.
  // Taxed reduced-transfer charges omit application_fee_amount entirely; untaxed charges often set
  // application_fee_amount = platformFee + seller-paid processing, so stripeApplicationFeeCents
  // is not the platform fee.
  const platformFeeAmountCents = applicationFeeCentsFromSubtotalUsd(input.itemPriceUsd, platformFeePercent);
  const platformFeeCents: LabeledCents = {
    cents: platformFeeAmountCents,
    source: "actual",
    formula:
      "order platform fee = round(itemSubtotal × feeRate) — not stripeApplicationFeeCents (taxed path has no app fee; untaxed app fee may include processing)",
  };

  const processingEstimated = estimateStripeProcessingFeeCents(customerTotalCents);
  const stripeProcessingFeeCents: LabeledCents =
    input.stripeProcessingFeeCents != null
      ? {
          cents: Math.max(0, input.stripeProcessingFeeCents),
          source: "actual",
          formula: "balance_transaction.fee → Order.stripeProcessingFeeCents",
        }
      : {
          cents: processingEstimated,
          source: "estimated",
          formula: "round(customerTotal × 2.9% + $0.30)",
        };

  const feeForTransfer = platformFeeCents.cents ?? 0;
  const procForTransfer = stripeProcessingFeeCents.cents ?? 0;
  const derivedTransfer = Math.max(0, itemSubtotalCents + buyerShippingCents - feeForTransfer - procForTransfer);
  const sellerTransferCents: LabeledCents =
    input.stripeTransferAmountCents != null
      ? {
          cents: Math.max(0, input.stripeTransferAmountCents),
          source: "actual",
          formula: "Stripe Transfer.amount / transfer_data.amount",
        }
      : {
          cents: derivedTransfer,
          source: "derived",
          formula: "item + buyerShipping − platformFee − sellerPaidProcessing",
        };

  const labelFinances = input.labelFinances ?? [];
  const labelSummary =
    labelFinances.length > 0
      ? summarizeLabelFinanceRows(labelFinances)
      : null;

  const chargeableFromRows = labelSummary?.chargeableLabelCostCents ?? null;
  const actualLabel =
    chargeableFromRows != null && chargeableFromRows > 0
      ? chargeableFromRows
      : resolveActualLabelCostCents(input);
  const actualLabelCostCents: LabeledCents =
    actualLabel != null
      ? {
          cents: actualLabel,
          source: "actual",
          formula:
            labelFinances.length > 0
              ? "sum(chargeable ShipmentLabelFinance.labelCostCents)"
              : "Order.shippingLabelCostCents or ShipmentPackage.labelCostCents",
        }
      : {
          cents: null,
          source: "unavailable",
          formula: "No purchased Shippo label recorded (session estimates are ignored)",
        };

  const grossSellerClawbackCents =
    labelSummary?.grossSellerClawbackCents ?? Math.max(0, input.shippingLabelCostReversedCents ?? 0);
  const sellerLabelCreditCents = labelSummary?.sellerCreditCents ?? 0;
  const sellerLabelDeductionCents =
    labelSummary?.netSellerDeductionCents ?? Math.max(0, input.shippingLabelCostReversedCents ?? 0);
  const chargeableLabelCostCents = actualLabel ?? 0;
  const platformShippingVarianceCents = sellerLabelDeductionCents - chargeableLabelCostCents;

  const labelFinanceRows: OrderLedgerLabelRow[] = labelFinances.map((row) => ({
    shippoTransactionId: row.shippoTransactionId,
    shippoShipmentId: row.shippoShipmentId,
    labelCostCents: row.labelCostCents,
    purpose: row.purpose,
    status: row.status,
    sellerClawbackCents: row.sellerClawbackCents,
    sellerCreditCents: row.sellerCreditCents,
    netSellerCents: labelNetSellerCents(row),
    sellerClawbackReversalId: row.sellerClawbackReversalId,
    sellerCreditTransferId: row.sellerCreditTransferId,
    replacesShippoTransactionId: row.replacesShippoTransactionId,
    chargeable: isLabelCostChargeable(row.status),
    clawbackMissing: isLabelCostChargeable(row.status) && !labelHasSuccessfulClawback(row),
  }));

  const labelFinanceActionStatus = resolveLabelFinanceActionStatus({
    chargeableLabelCostCents,
    grossSellerClawbackCents,
    sellerCreditCents: sellerLabelCreditCents,
    netSellerDeductionCents: sellerLabelDeductionCents,
    latestClawbackReversalId: input.shippingLabelCostReversalId,
    latestChargedShippoTransactionId: labelSummary?.latestChargedShippoTransactionId ?? null,
    hasRefundPending: labelSummary?.hasRefundPending ?? false,
    labelsMissingClawback: labelSummary?.labelsMissingClawback ?? [],
    labelsNeedingCredit: labelSummary?.labelsNeedingCredit ?? [],
    labelCount: Math.max(labelFinances.length, actualLabel != null && actualLabel > 0 ? 1 : 0),
  });

  // Legacy path (no label finance rows): only retry when net deduction ≠ chargeable cost and deduction is short.
  const needsLabelCostRetry =
    labelFinances.length > 0
      ? labelFinanceRows.some((r) => r.clawbackMissing)
      : chargeableLabelCostCents > 0 &&
        sellerLabelDeductionCents < chargeableLabelCostCents;

  const transferCents = sellerTransferCents.cents ?? 0;
  const sellerFinalNetCents: LabeledCents = {
    cents: Math.max(0, transferCents - sellerLabelDeductionCents - Math.max(0, input.payoutReserveAmountCents)),
    source: sellerLabelDeductionCents > 0 || input.stripeTransferAmountCents != null ? "derived" : "estimated",
    formula: "sellerTransfer − labelDeduction − payoutReserve (reserve is bookkeeping-only)",
  };

  // Platform earned revenue = platform fee only (NOT tax, NOT buyer shipping)
  const platformEarnedRevenueCents = platformFeeCents.cents ?? 0;
  const platformHeldTaxCents = Math.max(0, salesTaxCents - taxRefundedCents);

  const platformCashBeforeProcessingCents: LabeledCents = {
    cents: Math.max(0, customerTotalCents - transferCents),
    source: sellerTransferCents.source === "actual" ? "derived" : "estimated",
    formula: "customerCharge − sellerTransfer (= platformFee + processing + tax on taxed path)",
  };

  const platformCashAfterProcessingCents: LabeledCents = {
    cents:
      platformCashBeforeProcessingCents.cents != null && stripeProcessingFeeCents.cents != null
        ? platformCashBeforeProcessingCents.cents - stripeProcessingFeeCents.cents
        : null,
    source:
      platformCashBeforeProcessingCents.source === "derived" && stripeProcessingFeeCents.source === "actual"
        ? "derived"
        : "estimated",
    formula: "platformCashBeforeProcessing − actualStripeProcessingFee",
  };

  const disputeLossCents = isChargeback ? customerTotalCents : 0;
  const refundTotalCents = amountRefundedCents;

  const varianceReasons: string[] = [];
  if (stripeProcessingFeeCents.source === "estimated") {
    varianceReasons.push("Stripe processing fee missing — value marked Estimated (run fee backfill)");
  }
  if (labelFinanceActionStatus === "waiting_for_shippo_refund") {
    varianceReasons.push("Waiting for Shippo label refund/void on a replaced label");
  }
  if (labelFinanceActionStatus === "seller_credit_required" || labelFinanceActionStatus === "overcharge") {
    varianceReasons.push(
      `Seller credit required — net deduction ${sellerLabelDeductionCents}¢ > chargeable label ${chargeableLabelCostCents}¢`,
    );
  }
  if (labelFinanceActionStatus === "seller_charge_required") {
    varianceReasons.push(
      `Seller charge required — net deduction ${sellerLabelDeductionCents}¢ < chargeable label ${chargeableLabelCostCents}¢`,
    );
  }
  if (labelFinanceActionStatus === "reconciled_multiple_labels") {
    // Informational — not an exception; both chargeable labels are expected.
  }
  if (actualLabel != null && actualLabel > 0 && sellerLabelDeductionCents === 0) {
    varianceReasons.push("Get Vaulted paid a label but no seller reimbursement exists");
  }
  if (input.shippingStatus === "label_cost_reversal_failed") {
    varianceReasons.push("shippingStatus=label_cost_reversal_failed");
  }
  if (salesTaxCents > 0 && !input.stripeTaxTransactionId) {
    varianceReasons.push("Tax collected but Stripe Tax Transaction id missing");
  }
  if (isChargeback) {
    varianceReasons.push("Chargeback / dispute — verify seller recovery");
  }
  if (isRefunded) {
    varianceReasons.push("Fully refunded — verify transfer / tax / app-fee reverse");
  }

  // Final variance: platform shipping variance + missing fee actuals treated as soft warn
  let finalVarianceCents = platformShippingVarianceCents;
  if (sellerTransferCents.source === "actual" && platformFeeCents.source === "actual") {
    const expectedKeep = (platformFeeCents.cents ?? 0) + (stripeProcessingFeeCents.cents ?? 0) + salesTaxCents;
    const actualKeep = customerTotalCents - (sellerTransferCents.cents ?? 0);
    const keepDelta = actualKeep - expectedKeep;
    if (Math.abs(keepDelta) >= 1) {
      finalVarianceCents += keepDelta;
      varianceReasons.push(`Platform keep delta ${keepDelta}¢ vs fee+processing+tax`);
    }
  }

  let reconciliationStatus: OrderFinancialLedger["reconciliationStatus"] = "reconciled";
  if (isChargeback) reconciliationStatus = "chargeback";
  else if (isRefunded) reconciliationStatus = "refunded";
  else if (labelFinanceActionStatus === "waiting_for_shippo_refund") {
    reconciliationStatus = "exception";
  } else if (
    labelFinanceActionStatus === "seller_charge_required" ||
    labelFinanceActionStatus === "seller_credit_required" ||
    labelFinanceActionStatus === "overcharge" ||
    input.shippingStatus === "label_cost_reversal_failed"
  ) {
    reconciliationStatus = "exception";
  } else if (stripeProcessingFeeCents.source === "estimated") {
    reconciliationStatus = "estimated";
  } else if (!input.shippoTransactionId && input.fulfillmentStatus === "pending") {
    reconciliationStatus = "pending_label";
  } else if (varianceReasons.some((r) => r.includes("failed") || r.includes("missing"))) {
    reconciliationStatus = "exception";
  }

  const everythingReconciled =
    reconciliationStatus === "reconciled" ||
    reconciliationStatus === "pending_label" ||
    (reconciliationStatus === "estimated" && Math.abs(finalVarianceCents) < 1);

  const purchaseType: "marketplace" | "live" = input.liveShowId ? "live" : "marketplace";

  return {
    orderId: input.id,
    createdAt: input.createdAt.toISOString(),
    buyerUsername: input.buyerUsername,
    sellerUsername: input.sellerUsername,
    listingTitle: input.listingTitle,
    purchaseType,
    buyingFormat: input.buyingFormat,
    paymentStatus: input.paymentStatus,
    fulfillmentStatus: input.fulfillmentStatus,
    payoutStatus: input.payoutStatus,

    itemSubtotalCents,
    buyerShippingCents,
    salesTaxCents,
    discountCents,
    customerTotalCents,
    amountRefundedCents,
    finalBuyerPaidCents,

    platformFeePercent,
    platformFeeCents,
    stripeProcessingFeeCents,
    sellerTransferCents,

    estimatedLabelCostCents: input.estimatedLabelCostCents,
    actualLabelCostCents,
    chargeableLabelCostCents,
    grossSellerClawbackCents,
    sellerLabelCreditCents,
    sellerLabelDeductionCents,
    shippingLabelCostReversalId: input.shippingLabelCostReversalId,
    shippoTransactionId: input.shippoTransactionId,
    shippoShipmentId: input.shippoShipmentId,
    trackingNumber: input.trackingNumber,
    platformShippingVarianceCents,
    labelFinanceRows,
    labelFinanceActionStatus,
    needsLabelCostRetry,

    sellerFinalNetCents,
    platformEarnedRevenueCents,
    platformHeldTaxCents,
    platformCashBeforeProcessingCents,
    platformCashAfterProcessingCents,
    disputeLossCents,
    refundTotalCents,
    finalVarianceCents,
    reconciliationStatus,
    varianceReasons,
    everythingReconciled: everythingReconciled && Math.abs(finalVarianceCents) < 1 && varianceReasons.filter((r) => !r.includes("Estimated") && !r.includes("pending")).length === 0,

    stripePaymentIntentId: input.stripePaymentIntentId,
    stripeChargeId: input.stripeChargeId,
    stripeBalanceTransactionId: input.stripeBalanceTransactionId,
    stripeTransferId: input.stripeTransferId,
    stripeTaxCalculationId: input.stripeTaxCalculationId,
    stripeTaxTransactionId: input.stripeTaxTransactionId,

    sections: {
      buyer: {
        itemSubtotalCents,
        shippingChargedCents: buyerShippingCents,
        salesTaxCents,
        discountCents,
        totalChargedCents: customerTotalCents,
        amountRefundedCents,
        finalBuyerPaidCents,
      },
      stripe: {
        paymentIntentId: input.stripePaymentIntentId,
        chargeId: input.stripeChargeId,
        balanceTransactionId: input.stripeBalanceTransactionId,
        processingFeeCents: stripeProcessingFeeCents.cents,
        processingFeeSource: stripeProcessingFeeCents.source,
        stripeNetCents: input.stripeNetCents,
        taxCalculationId: input.stripeTaxCalculationId,
        taxTransactionId: input.stripeTaxTransactionId,
        taxTransactionReversalId: input.stripeTaxTransactionReversalId,
        transferId: input.stripeTransferId,
        transferReversalId: input.shippingLabelCostReversalId,
        /** Stripe application_fee_amount when present (may include processing on untaxed path; null on taxed). */
        stripeApplicationFeeAmountCents: input.stripeApplicationFeeCents,
        platformFeeCents: platformFeeCents.cents,
      },
      seller: {
        sellerGrossCents: itemSubtotalCents + buyerShippingCents,
        platformFeeChargedCents: platformFeeCents,
        sellerPaidProcessingFeeCents: stripeProcessingFeeCents,
        buyerShippingCreditedCents: buyerShippingCents,
        originalTransferCents: sellerTransferCents,
        labelCostDeductionCents: sellerLabelDeductionCents,
        payoutReserveCents: input.payoutReserveAmountCents,
        finalSellerProceedsCents: sellerFinalNetCents,
        payoutStatus: input.payoutStatus,
      },
      platform: {
        platformFeeEarnedCents: platformEarnedRevenueCents,
        stripeProcessingFeeCents,
        salesTaxHeldCents: platformHeldTaxCents,
        shippoLabelCostPaidCents: actualLabelCostCents,
        labelCostReimbursementCents: sellerLabelDeductionCents,
        platformShippingVarianceCents,
        finalPlatformRevenueCents: {
          cents: platformEarnedRevenueCents,
          source: platformFeeCents.source,
          formula: "platformFee only — tax and buyer shipping are not revenue",
        },
        finalPlatformCashMovementCents: platformCashAfterProcessingCents,
        varianceCents: finalVarianceCents,
      },
    },
  };
}

export function centsToUsd(cents: number | null | undefined): number {
  if (cents == null || !Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}
