import { describe, expect, it } from "vitest";
import {
  includeHostRecentSaleRow,
  shouldHideOrderForSpotCommerceRow,
} from "./live-room-recent-sales";

describe("includeHostRecentSaleRow", () => {
  it("includes paid and failed rows only", () => {
    expect(includeHostRecentSaleRow({ paymentTone: "paid" })).toBe(true);
    expect(includeHostRecentSaleRow({ paymentTone: "retry" })).toBe(true);
    expect(includeHostRecentSaleRow({ paymentTone: "pending" })).toBe(false);
  });
});

describe("shouldHideOrderForSpotCommerceRow", () => {
  it("hides fulfillment orders linked to a spot row", () => {
    expect(
      shouldHideOrderForSpotCommerceRow(
        { id: "ord_1", buyerId: "buyer_a", itemPriceUsd: 25 },
        [{ buyerId: "buyer_a", amountUsd: 25, fulfillmentOrderId: "ord_1", paid: true }],
      ),
    ).toBe(true);
  });

  it("hides session orders when a paid spot exists for the same buyer and price", () => {
    expect(
      shouldHideOrderForSpotCommerceRow(
        { id: "ord_2", buyerId: "buyer_a", itemPriceUsd: 40 },
        [{ buyerId: "buyer_a", amountUsd: 40, fulfillmentOrderId: null, paid: true }],
      ),
    ).toBe(true);
  });

  it("keeps unrelated auction orders visible", () => {
    expect(
      shouldHideOrderForSpotCommerceRow(
        { id: "ord_3", buyerId: "buyer_b", itemPriceUsd: 100 },
        [{ buyerId: "buyer_a", amountUsd: 40, fulfillmentOrderId: null, paid: true }],
      ),
    ).toBe(false);
  });
});
