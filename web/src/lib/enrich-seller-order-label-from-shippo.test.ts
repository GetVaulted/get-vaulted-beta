import { describe, expect, it } from "vitest";
import { sellerOrderLabelNeedsRepair } from "./enrich-seller-order-label-from-shippo";

describe("sellerOrderLabelNeedsRepair", () => {
  it("returns false when label file exists", () => {
    expect(
      sellerOrderLabelNeedsRepair({
        shippoTransactionId: "tx_123",
        labelUrl: "https://shippo-delivery.s3.amazonaws.com/label.pdf",
        labelCreatedAt: new Date("2026-06-14"),
        fulfillmentStatus: "label_created",
      }),
    ).toBe(false);
  });

  it("returns true when Shippo transaction exists but label URL is missing", () => {
    expect(
      sellerOrderLabelNeedsRepair({
        shippoTransactionId: "tx_123",
        labelUrl: null,
        labelCreatedAt: new Date("2026-06-14"),
        fulfillmentStatus: "label_created",
      }),
    ).toBe(true);
  });

  it("returns true when label was created but file and transaction id are missing", () => {
    expect(
      sellerOrderLabelNeedsRepair({
        shippoTransactionId: null,
        labelUrl: null,
        labelCreatedAt: new Date("2026-06-14"),
        fulfillmentStatus: "label_created",
      }),
    ).toBe(true);
  });

  it("returns false for unpaid orders with no label metadata", () => {
    expect(
      sellerOrderLabelNeedsRepair({
        shippoTransactionId: null,
        labelUrl: null,
        labelCreatedAt: null,
        fulfillmentStatus: "pending",
      }),
    ).toBe(false);
  });
});
