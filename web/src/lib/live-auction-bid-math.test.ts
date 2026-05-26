import { describe, expect, it } from "vitest";
import {
  liveAuctionHasAcceptedBid,
  liveAuctionMinBidUsd,
  liveAuctionOpeningUsd,
  minNextBidUsd,
} from "@/lib/auction";

describe("liveAuctionMinBidUsd", () => {
  it("first bid equals opening price when start is $1 and no high bidder", () => {
    expect(
      liveAuctionMinBidUsd({
        startingBidUsd: 1,
        currentBidUsd: 1,
        lastHighBidderId: null,
      }),
    ).toBe(1);
  });

  it("second bid uses increment after a bid is accepted", () => {
    expect(
      liveAuctionMinBidUsd({
        startingBidUsd: 1,
        currentBidUsd: 1,
        lastHighBidderId: "user-1",
      }),
    ).toBe(minNextBidUsd(1));
  });

  it("opening price prefers startingBidUsd over seeded currentBidUsd", () => {
    expect(
      liveAuctionOpeningUsd({
        startingBidUsd: 1,
        currentBidUsd: 1,
        priceUsd: 5,
      }),
    ).toBe(1);
  });

  it("liveAuctionHasAcceptedBid requires lastHighBidderId", () => {
    expect(liveAuctionHasAcceptedBid({ currentBidUsd: 10, lastHighBidderId: null })).toBe(false);
    expect(liveAuctionHasAcceptedBid({ currentBidUsd: 10, lastHighBidderId: "u1" })).toBe(true);
  });
});
