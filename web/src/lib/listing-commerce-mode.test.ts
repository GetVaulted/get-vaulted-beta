import { describe, expect, it } from "vitest";
import { isTradeOnlyListing } from "./listing-commerce-mode";

describe("listing-commerce-mode", () => {
  it("detects trade-only listings from persisted flags", () => {
    expect(
      isTradeOnlyListing({
        buyingFormat: "buy_now",
        acceptTradeOffers: true,
        allowOffers: false,
        allowLayaway: false,
        priceUsd: 1,
      }),
    ).toBe(true);
  });

  it("does not mark buy-now + trades listings as trade-only", () => {
    expect(
      isTradeOnlyListing({
        buyingFormat: "buy_now",
        acceptTradeOffers: true,
        allowOffers: false,
        allowLayaway: false,
        priceUsd: 250,
      }),
    ).toBe(false);
  });
});
