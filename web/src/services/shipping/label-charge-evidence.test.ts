import { describe, expect, it } from "vitest";
import {
  classifyDualLabelBillingEvidence,
  shouldClawbackSellerForShippoPurchase,
} from "@/services/shipping/label-charge-evidence";

describe("shouldClawbackSellerForShippoPurchase", () => {
  it("ERROR transaction does not trigger seller clawback", () => {
    expect(
      shouldClawbackSellerForShippoPurchase({ status: "ERROR", transactionId: "tx_1" }),
    ).toBe(false);
  });

  it("SUCCESS with transaction id triggers clawback eligibility", () => {
    expect(
      shouldClawbackSellerForShippoPurchase({ status: "SUCCESS", transactionId: "tx_1" }),
    ).toBe(true);
  });

  it("SUCCESS + INVALID object_state never triggers clawback", () => {
    expect(
      shouldClawbackSellerForShippoPurchase({
        status: "SUCCESS",
        transactionId: "tx_1",
        objectState: "INVALID",
      }),
    ).toBe(false);
  });
});

describe("classifyDualLabelBillingEvidence", () => {
  it("two failed purchases → NEITHER_LABEL_CHARGED with 3502 credit", () => {
    const r = classifyDualLabelBillingEvidence({
      firstVerdict: "failed_purchase",
      secondVerdict: "failed_purchase",
    });
    expect(r.classification).toBe("NEITHER_LABEL_CHARGED");
    expect(r.financials.expectedSellerCreditCents).toBe(3502);
    expect(r.financials.expectedNetSellerDeductionCents).toBe(0);
    expect(r.financials.expectedChargeableLabelCostCents).toBe(0);
  });

  it("failed first + successful replacement → ONE_LABEL_CHARGED / one clawback net", () => {
    const r = classifyDualLabelBillingEvidence({
      firstVerdict: "failed_purchase",
      secondVerdict: "chargeable",
    });
    expect(r.classification).toBe("ONE_LABEL_CHARGED");
    expect(r.financials.expectedSellerCreditCents).toBe(1751);
    expect(r.financials.expectedNetSellerDeductionCents).toBe(1751);
    expect(r.financials.expectedChargeableLabelCostCents).toBe(1751);
  });

  it("two successful charges → BOTH_LABELS_CHARGED", () => {
    const r = classifyDualLabelBillingEvidence({
      firstVerdict: "chargeable",
      secondVerdict: "chargeable",
    });
    expect(r.classification).toBe("BOTH_LABELS_CHARGED");
    expect(r.financials.expectedSellerCreditCents).toBe(0);
    expect(r.financials.expectedNetSellerDeductionCents).toBe(3502);
  });

  it("ERROR/unknown billing becomes manual review", () => {
    const r = classifyDualLabelBillingEvidence({
      firstVerdict: "unknown",
      secondVerdict: "unknown",
    });
    expect(r.classification).toBe("MANUAL_REVIEW_REQUIRED");
  });

  it("refunded first + chargeable second → CREDIT_REQUIRED_1751", () => {
    const r = classifyDualLabelBillingEvidence({
      firstVerdict: "refunded",
      secondVerdict: "chargeable",
    });
    expect(r.classification).toBe("CREDIT_REQUIRED_1751");
    expect(r.financials.expectedSellerCreditCents).toBe(1751);
    expect(r.financials.expectedNetSellerDeductionCents).toBe(1751);
  });

  it("dry-run classification follows actual Shippo billing evidence (not empty refunds)", () => {
    // Previous bug: ERROR + empty refunds → BOTH_LABELS_CHARGEABLE. Must be manual review.
    const r = classifyDualLabelBillingEvidence({
      firstVerdict: "unknown",
      secondVerdict: "unknown",
    });
    expect(r.classification).not.toBe("BOTH_LABELS_CHARGED");
    expect(r.classification).toBe("MANUAL_REVIEW_REQUIRED");
  });
});
