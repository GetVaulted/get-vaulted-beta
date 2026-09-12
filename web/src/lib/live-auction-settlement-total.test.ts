import { describe, expect, it } from "vitest";
import { computeLiveAuctionSettlementBreakdown } from "./live-auction-settlement-total";

describe("live-auction-settlement-total", () => {
  it("sums subtotal tax and shipping", () => {
    expect(
      computeLiveAuctionSettlementBreakdown({
        winningBidUsd: 50,
        shippingUsd: 5.99,
        taxUsd: 0,
        shippingCapCents: 999,
      }),
    ).toMatchObject({
      subtotalUsd: 50,
      shippingUsd: 5.99,
      taxUsd: 0,
      totalUsd: 55.99,
      taxSource: "none",
    });
  });
});
