import { describe, expect, it } from "vitest";
import {
  orderHasLabelFile,
  orderHasPurchasedLabel,
  sellerTrackingStatusLabel,
} from "@/lib/seller-shipping-label-state";

describe("seller-shipping-label-state", () => {
  it("detects purchased label from transaction id", () => {
    expect(orderHasPurchasedLabel({ shippoTransactionId: "tx_1", fulfillmentStatus: "pending" })).toBe(true);
  });

  it("detects purchased label from fulfillment status after label_created", () => {
    expect(orderHasPurchasedLabel({ fulfillmentStatus: "in_transit" })).toBe(true);
    expect(orderHasPurchasedLabel({ fulfillmentStatus: "delivered" })).toBe(true);
  });

  it("detects missing label file", () => {
    expect(orderHasLabelFile("https://shippo.com/label.pdf")).toBe(true);
    expect(orderHasLabelFile("")).toBe(false);
  });

  it("maps tracking status labels", () => {
    expect(sellerTrackingStatusLabel("label_created")).toBe("Label created");
    expect(sellerTrackingStatusLabel("in_transit", "TRANSIT")).toBe("TRANSIT");
  });
});
