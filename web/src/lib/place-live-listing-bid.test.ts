import { describe, expect, it } from "vitest";
import { liveAuctionMinBidUsd } from "@/lib/auction";

/**
 * Live listing bids must use live min-next (first bid = opening), not marketplace
 * `minNextBidUsd(opening)` which forces opening + increment on the first bid.
 */
describe("live listing bid floor vs marketplace proxy floor", () => {
  it("first live bid equals opening price", () => {
    expect(
      liveAuctionMinBidUsd({
        currentBidUsd: null,
        startingBidUsd: 25,
        priceUsd: 25,
        lastHighBidderId: null,
      }),
    ).toBe(25);
  });

  it("after an accepted bid, next is opening + increment", () => {
    expect(
      liveAuctionMinBidUsd({
        currentBidUsd: 25,
        startingBidUsd: 25,
        priceUsd: 25,
        lastHighBidderId: "buyer_1",
      }),
    ).toBe(26);
  });

  it("honors host custom increment after first bid", () => {
    expect(
      liveAuctionMinBidUsd({
        currentBidUsd: 100,
        startingBidUsd: 50,
        lastHighBidderId: "buyer_1",
        bidIncrementUsd: 5,
      }),
    ).toBe(105);
  });
});
