export type BackfillClass =
  | "single_label_normal"
  | "multiple_legitimate_packages"
  | "replacement_regenerated_label"
  | "missing_package_history"
  | "cumulative_deduction_mismatch"
  | "unresolved_shippo_status"
  | "missing_stripe_reversal_history";

export function classifyOrderForLabelFinanceBackfill(input: {
  shippingLabelCostCents: number | null;
  shippingLabelCostReversedCents: number;
  shippingLabelCostReversalId: string | null;
  shippoTransactionId: string | null;
  packageCount: number;
  distinctShippoTxCount: number;
  packageIndexes: number[];
}): {
  classes: BackfillClass[];
  needsBackfill: boolean;
  deterministic: boolean;
  needsShippo: boolean;
  needsStripe: boolean;
  manualReview: boolean;
} {
  const label = input.shippingLabelCostCents ?? 0;
  const deducted = Math.max(0, input.shippingLabelCostReversedCents);
  const hasLabel = label > 0 || Boolean(input.shippoTransactionId?.trim()) || input.distinctShippoTxCount > 0;
  const classes: BackfillClass[] = [];

  if (!hasLabel && deducted <= 0) {
    return {
      classes: [],
      needsBackfill: false,
      deterministic: true,
      needsShippo: false,
      needsStripe: false,
      manualReview: false,
    };
  }

  const uniqueIndexes = new Set(input.packageIndexes);
  const looksLikeReplacement =
    input.distinctShippoTxCount >= 2 &&
    (uniqueIndexes.size === 1 || input.packageCount >= 2) &&
    label > 0 &&
    deducted === label * 2;
  const looksLikeMultiPackage =
    input.distinctShippoTxCount >= 2 &&
    uniqueIndexes.size >= 2 &&
    label > 0 &&
    deducted === label;

  if (input.distinctShippoTxCount === 0 && (label > 0 || Boolean(input.shippoTransactionId))) {
    classes.push("missing_package_history");
  } else if (looksLikeReplacement) {
    classes.push("replacement_regenerated_label");
  } else if (looksLikeMultiPackage) {
    classes.push("multiple_legitimate_packages");
  } else if (input.distinctShippoTxCount <= 1 && label > 0 && (deducted === 0 || deducted === label)) {
    classes.push("single_label_normal");
  } else if (input.distinctShippoTxCount >= 2) {
    classes.push("multiple_legitimate_packages");
  } else {
    classes.push("missing_package_history");
  }

  if (label > 0 && deducted > 0 && deducted !== label) {
    classes.push("cumulative_deduction_mismatch");
  }
  if (deducted > 0 && !input.shippingLabelCostReversalId?.trim()) {
    classes.push("missing_stripe_reversal_history");
  }
  if (classes.includes("replacement_regenerated_label") || classes.includes("cumulative_deduction_mismatch")) {
    classes.push("unresolved_shippo_status");
  }

  const needsBackfill = hasLabel || deducted > 0;
  const needsShippo =
    classes.includes("unresolved_shippo_status") || classes.includes("replacement_regenerated_label");
  const needsStripe =
    classes.includes("missing_stripe_reversal_history") ||
    classes.includes("cumulative_deduction_mismatch") ||
    classes.includes("replacement_regenerated_label");
  const manualReview =
    classes.includes("cumulative_deduction_mismatch") ||
    classes.includes("missing_stripe_reversal_history") ||
    (classes.includes("missing_package_history") && deducted > 0);
  const deterministic =
    needsBackfill &&
    !needsShippo &&
    !manualReview &&
    (classes.includes("single_label_normal") || classes.includes("multiple_legitimate_packages"));

  return {
    classes: [...new Set(classes)],
    needsBackfill,
    deterministic,
    needsShippo,
    needsStripe,
    manualReview,
  };
}
