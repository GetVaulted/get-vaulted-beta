import { describe, expect, it } from "vitest";
import {
  isLiveAuctionPreBidEligible,
  liveAuctionPreBidMinUsd,
} from "./live-auction-pre-bid";

describe("live-auction-pre-bid", () => {
  it("allows host auction lots before bidding opens", () => {
    expect(
      isLiveAuctionPreBidEligible({
        id: "i1",
        status: "active",
        salesFormat: "auction",
        listingId: null,
        biddingOpen: false,
        startingBidUsd: 5,
        currentBidUsd: null,
        lastHighBidderId: null,
      }),
    ).toBe(true);
  });

  it("rejects listing-backed and buy-now rows", () => {
    expect(
      isLiveAuctionPreBidEligible({
        id: "i1",
        status: "active",
        salesFormat: "auction",
        listingId: "listing-1",
        biddingOpen: false,
        startingBidUsd: 5,
        currentBidUsd: null,
        lastHighBidderId: null,
      }),
    ).toBe(false);
  });

  it("uses starting bid as minimum when no leader", () => {
    expect(
      liveAuctionPreBidMinUsd({
        id: "i1",
        status: "active",
        salesFormat: "auction",
        listingId: null,
        biddingOpen: false,
        startingBidUsd: 12,
        currentBidUsd: null,
        lastHighBidderId: null,
      }),
    ).toBe(12);
  });
});
