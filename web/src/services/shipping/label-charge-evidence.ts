import type { ShippoLabelRefundVerdict } from "@/services/shipping/shippo-label-refund-status";

export type LabelBillingClass =
  | "NEITHER_LABEL_CHARGED"
  | "ONE_LABEL_CHARGED"
  | "BOTH_LABELS_CHARGED"
  | "PENDING_SHIPPO_REFUND"
  | "MANUAL_REVIEW_REQUIRED"
  | "CREDIT_REQUIRED_1751";

export type LabelBillingFinancials = {
  expectedSellerCreditCents: number | null;
  expectedNetSellerDeductionCents: number | null;
  expectedChargeableLabelCostCents: number | null;
  remainingReconciliationDiffCents: number | null;
};

/**
 * Classify an order with two label attempts from Shippo verdicts.
 * Does not treat empty refund lists / ERROR as proof of billing.
 */
export function classifyDualLabelBillingEvidence(args: {
  firstVerdict: ShippoLabelRefundVerdict;
  secondVerdict: ShippoLabelRefundVerdict;
  labelCostCentsEach?: number;
  existingSellerCreditCents?: number;
}): { classification: LabelBillingClass; financials: LabelBillingFinancials } {
  const each = args.labelCostCentsEach ?? 1751;
  const existingCredit = Math.max(0, args.existingSellerCreditCents ?? 0);
  const first = args.firstVerdict;
  const second = args.secondVerdict;

  if (first === "refund_pending" || second === "refund_pending") {
    return {
      classification: "PENDING_SHIPPO_REFUND",
      financials: {
        expectedSellerCreditCents: null,
        expectedNetSellerDeductionCents: null,
        expectedChargeableLabelCostCents: null,
        remainingReconciliationDiffCents: null,
      },
    };
  }

  if (first === "unknown" || second === "unknown") {
    return {
      classification: "MANUAL_REVIEW_REQUIRED",
      financials: {
        expectedSellerCreditCents: null,
        expectedNetSellerDeductionCents: null,
        expectedChargeableLabelCostCents: null,
        remainingReconciliationDiffCents: null,
      },
    };
  }

  const chargedCount = [first, second].filter((v) => v === "chargeable").length;
  const failedCount = [first, second].filter((v) => v === "failed_purchase" || v === "refunded").length;

  // Both failed / refunded → no chargeable label cost; seller should be credited for erroneous clawbacks.
  if (chargedCount === 0 && failedCount === 2) {
    const credit = Math.max(0, each * 2 - existingCredit);
    return {
      classification: "NEITHER_LABEL_CHARGED",
      financials: {
        expectedSellerCreditCents: credit,
        expectedNetSellerDeductionCents: 0,
        expectedChargeableLabelCostCents: 0,
        remainingReconciliationDiffCents: 0,
      },
    };
  }

  if (chargedCount === 1) {
    // One real charge; if the other was refunded/failed and already clawed, credit one unit.
    const other = first === "chargeable" ? second : first;
    const creditNeeded =
      other === "refunded" || other === "failed_purchase" ? Math.max(0, each - existingCredit) : 0;
    return {
      classification: other === "refunded" ? "CREDIT_REQUIRED_1751" : "ONE_LABEL_CHARGED",
      financials: {
        expectedSellerCreditCents: creditNeeded,
        expectedNetSellerDeductionCents: each,
        expectedChargeableLabelCostCents: each,
        remainingReconciliationDiffCents: 0,
      },
    };
  }

  if (chargedCount === 2) {
    return {
      classification: "BOTH_LABELS_CHARGED",
      financials: {
        expectedSellerCreditCents: 0,
        expectedNetSellerDeductionCents: each * 2,
        expectedChargeableLabelCostCents: each * 2,
        remainingReconciliationDiffCents: 0,
      },
    };
  }

  return {
    classification: "MANUAL_REVIEW_REQUIRED",
    financials: {
      expectedSellerCreditCents: null,
      expectedNetSellerDeductionCents: null,
      expectedChargeableLabelCostCents: null,
      remainingReconciliationDiffCents: null,
    },
  };
}

/** Whether a purchased package should trigger seller clawback. */
export function shouldClawbackSellerForShippoPurchase(args: {
  status?: string | null;
  transactionId?: string | null;
  objectState?: string | null;
  labelUrl?: string | null;
}): boolean {
  // Keep import-free for unit tests; mirror isShippoLabelPurchaseSuccessful rules.
  const status = String(args.status ?? "").toUpperCase();
  const objectState = String(args.objectState ?? "").toUpperCase();
  const txId = args.transactionId?.trim() ?? "";
  if (status !== "SUCCESS") return false;
  if (!txId) return false;
  if (objectState === "INVALID") return false;
  return true;
}
