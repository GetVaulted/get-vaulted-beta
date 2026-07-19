import { describe, expect, it } from "vitest";
import {
  assertBidExceedsCurrentHigh,
  currentHighUsdFromLockedItem,
  isAuctionWindowEndedAt,
} from "@/lib/live-room-bid-lock";

describe("isAuctionWindowEndedAt", () => {
  it("keeps a snipe open when receipt was before end even if commit clock is after", () => {
    const endsAt = new Date("2026-01-01T00:00:02.000Z");
    const receivedAt = new Date("2026-01-01T00:00:01.500Z");
    const nowAfterPreflight = new Date("2026-01-01T00:00:02.400Z");
    expect(isAuctionWindowEndedAt(endsAt, receivedAt)).toBe(false);
    expect(isAuctionWindowEndedAt(endsAt, nowAfterPreflight)).toBe(true);
  });

  it("rejects when receipt is at or after end", () => {
    const endsAt = new Date("2026-01-01T00:00:02.000Z");
    expect(isAuctionWindowEndedAt(endsAt, endsAt)).toBe(true);
    expect(isAuctionWindowEndedAt(endsAt, new Date("2026-01-01T00:00:02.001Z"))).toBe(true);
  });

  it("never ends untimed lots", () => {
    expect(isAuctionWindowEndedAt(null, new Date())).toBe(false);
  });
});

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
