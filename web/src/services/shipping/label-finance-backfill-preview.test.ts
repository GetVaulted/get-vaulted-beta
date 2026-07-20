import { describe, expect, it } from "vitest";
import { classifyOrderForLabelFinanceBackfill } from "@/services/shipping/label-finance-backfill-preview";

describe("classifyOrderForLabelFinanceBackfill", () => {
  it("classifies single-label normal", () => {
    const r = classifyOrderForLabelFinanceBackfill({
      shippingLabelCostCents: 500,
      shippingLabelCostReversedCents: 500,
      shippingLabelCostReversalId: "trr_1",
      shippoTransactionId: "tx_1",
      packageCount: 1,
      distinctShippoTxCount: 1,
      packageIndexes: [0],
    });
    expect(r.classes).toContain("single_label_normal");
    expect(r.deterministic).toBe(true);
    expect(r.manualReview).toBe(false);
  });

  it("classifies replacement double-charge mismatch", () => {
    const r = classifyOrderForLabelFinanceBackfill({
      shippingLabelCostCents: 1751,
      shippingLabelCostReversedCents: 3502,
      shippingLabelCostReversalId: "trr_2",
      shippoTransactionId: "tx_2",
      packageCount: 2,
      distinctShippoTxCount: 2,
      packageIndexes: [0, 0],
    });
    expect(r.classes).toContain("replacement_regenerated_label");
    expect(r.classes).toContain("cumulative_deduction_mismatch");
    expect(r.needsShippo).toBe(true);
    expect(r.manualReview).toBe(true);
  });

  it("classifies multiple legitimate packages", () => {
    const r = classifyOrderForLabelFinanceBackfill({
      shippingLabelCostCents: 1800,
      shippingLabelCostReversedCents: 1800,
      shippingLabelCostReversalId: "trr_1",
      shippoTransactionId: "tx_1",
      packageCount: 2,
      distinctShippoTxCount: 2,
      packageIndexes: [0, 1],
    });
    expect(r.classes).toContain("multiple_legitimate_packages");
    expect(r.deterministic).toBe(true);
  });
});
