import { describe, expect, it } from "vitest";
import {
  isStripeBankPayoutId,
  orderLabelClawbackSettledForBankPayout,
  orderLooksShippedForBankPayout,
} from "@/services/payout/stripe-seller-payout";

describe("stripe-seller-payout helpers", () => {
  it("detects Stripe bank payout ids", () => {
    expect(isStripeBankPayoutId("po_123")).toBe(true);
    expect(isStripeBankPayoutId("tr_123")).toBe(false);
    expect(isStripeBankPayoutId(null)).toBe(false);
  });

  it("treats shipped / carrier / fulfillment as shipped", () => {
    expect(orderLooksShippedForBankPayout({ shippedAt: new Date() })).toBe(true);
    expect(orderLooksShippedForBankPayout({ carrierAcceptedAt: new Date() })).toBe(true);
    expect(orderLooksShippedForBankPayout({ fulfillmentStatus: "in_transit" })).toBe(true);
    expect(orderLooksShippedForBankPayout({ fulfillmentStatus: "pending" })).toBe(false);
  });

  it("requires clawback when a GV label cost exists", () => {
    expect(
      orderLabelClawbackSettledForBankPayout({
        shippoTransactionId: "tx_1",
        shippingLabelCostCents: 607,
        shippingLabelCostReversedCents: 607,
      }),
    ).toBe(true);
    expect(
      orderLabelClawbackSettledForBankPayout({
        shippoTransactionId: "tx_1",
        shippingLabelCostCents: 607,
        shippingLabelCostReversedCents: 0,
      }),
    ).toBe(false);
    expect(orderLabelClawbackSettledForBankPayout({})).toBe(true);
  });
});
