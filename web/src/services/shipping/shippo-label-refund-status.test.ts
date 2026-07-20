import { describe, expect, it } from "vitest";
import {
  classifyShippoLabelRefundVerdict,
  extractProvenNoShippoCharge,
  extractShippoPurchaseProof,
  financeStatusFromShippoVerdict,
  isShippoLabelPurchaseSuccessful,
} from "@/services/shipping/shippo-label-refund-status";

const purchased = extractShippoPurchaseProof({
  status: "SUCCESS",
  label_url: "https://example.com/label.pdf",
  tracking_number: "9400",
});
const errorNoLabel = extractShippoPurchaseProof({
  status: "ERROR",
  label_url: null,
  tracking_number: "",
});

describe("extractShippoPurchaseProof", () => {
  it("SUCCESS is affirmatively purchased", () => {
    expect(purchased.affirmativelyPurchased).toBe(true);
    expect(purchased.statusIsSuccess).toBe(true);
  });

  it("ERROR with no label is not affirmatively purchased", () => {
    expect(errorNoLabel.affirmativelyPurchased).toBe(false);
    expect(errorNoLabel.hasLabelUrl).toBe(false);
  });
});

describe("classifyShippoLabelRefundVerdict", () => {
  it("Shippo SUCCESS transaction is chargeable", () => {
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "SUCCESS",
        refundStatuses: [],
        purchaseProof: purchased,
      }),
    ).toBe("chargeable");
  });

  it("Shippo ERROR with no billing proof is not chargeable", () => {
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "ERROR",
        refundStatuses: [],
        purchaseProof: errorNoLabel,
      }),
    ).toBe("unknown");
  });

  it("empty refund list does not imply chargeable for ERROR", () => {
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "ERROR",
        refundStatuses: [],
        purchaseProof: errorNoLabel,
      }),
    ).not.toBe("chargeable");
  });

  it("detects refunded and pending", () => {
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "REFUNDED",
        purchaseProof: purchased,
      }),
    ).toBe("refunded");
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "SUCCESS",
        refundStatuses: ["PENDING"],
        purchaseProof: purchased,
      }),
    ).toBe("refund_pending");
  });

  it("ERROR with proven no Shippo charge is failed_purchase", () => {
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "ERROR",
        purchaseProof: errorNoLabel,
        provenNoShippoCharge: true,
      }),
    ).toBe("failed_purchase");
  });

  it("detects proven no charge from empty billing.payments on INVALID ERROR", () => {
    expect(
      extractProvenNoShippoCharge(
        {
          status: "ERROR",
          object_state: "INVALID",
          billing: { payments: [] },
        },
        ["Your request has failed due to a billing issue."],
      ),
    ).toBe(true);
    expect(
      extractProvenNoShippoCharge({ status: "ERROR", billing: { payments: [{ amount: "17.51" }] } }, []),
    ).toBe(false);
  });

  it("maps verdicts onto finance statuses without assuming refund on unknown", () => {
    expect(financeStatusFromShippoVerdict("refunded")).toBe("refunded");
    expect(financeStatusFromShippoVerdict("chargeable")).toBe("replaced");
    expect(financeStatusFromShippoVerdict("unknown")).toBe("refund_pending");
    expect(financeStatusFromShippoVerdict("failed_purchase")).toBe("failed_purchase");
  });
});

describe("isShippoLabelPurchaseSuccessful", () => {
  it("requires SUCCESS status and valid transaction id", () => {
    expect(
      isShippoLabelPurchaseSuccessful({
        status: "SUCCESS",
        transactionId: "tx_1",
        labelUrl: "x",
      }),
    ).toBe(true);
    expect(isShippoLabelPurchaseSuccessful({ status: "ERROR", transactionId: "tx_1" })).toBe(false);
    expect(isShippoLabelPurchaseSuccessful({ status: "SUCCESS", transactionId: "" })).toBe(false);
    expect(
      isShippoLabelPurchaseSuccessful({
        status: "SUCCESS",
        transactionId: "tx_1",
        objectState: "INVALID",
      }),
    ).toBe(false);
  });
});
