import { describe, expect, it } from "vitest";
import { assertBidExceedsCurrentHigh, currentHighUsdFromLockedItem } from "@/lib/live-room-bid-lock";

describe("live-room-bid-lock helpers", () => {
  it("currentHighUsdFromLockedItem prefers current bid over starting", () => {
    expect(
      currentHighUsdFromLockedItem({
        id: "i1",
        liveRoomId: "r1",
        listingId: null,
        title: "Lot",
        status: "active",
        currentBidUsd: 25,
        startingBidUsd: 10,
        priceUsd: 10,
        biddingOpen: true,
        auctionEndsAt: null,
        clutchTimeEnabled: false,
        lastHighBidderId: null,
        itemVersion: 1,
      }),
    ).toBe(25);
  });

  it("assertBidExceedsCurrentHigh rejects non-increasing rebid from leader", () => {
    expect(() =>
      assertBidExceedsCurrentHigh({
        bidderId: "u1",
        amountUsd: 20,
        lastHighBidderId: "u1",
        currentHighUsd: 20,
      }),
    ).toThrow("ALREADY_HIGH_BIDDER");
  });

  it("assertBidExceedsCurrentHigh allows higher rebid from leader", () => {
    expect(() =>
      assertBidExceedsCurrentHigh({
        bidderId: "u1",
        amountUsd: 25,
        lastHighBidderId: "u1",
        currentHighUsd: 20,
      }),
    ).not.toThrow();
  });
});
