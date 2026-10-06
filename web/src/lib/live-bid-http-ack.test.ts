import { describe, expect, it } from "vitest";
import { buildLiveBidAckItem } from "@/lib/live-bid-http-ack";

describe("buildLiveBidAckItem", () => {
  it("builds a lean ACK item for fast bid responses", () => {
    const item = buildLiveBidAckItem({
      itemId: "item_1",
      itemVersion: 4,
      currentBidUsd: 12,
      startingBidUsd: 1,
      lastHighBidderId: "user_1",
      lastHighBidderUsername: "bidder",
      auctionEndsAt: "2026-07-20T12:00:00.000Z",
      clutchTimeEnabled: false,
    });

    expect(item).toEqual({
      id: "item_1",
      itemVersion: 4,
      currentBidUsd: 12,
      startingBidUsd: 1,
      lastHighBidderId: "user_1",
      lastHighBidderUsername: "bidder",
      biddingOpen: true,
      auctionEndsAt: "2026-07-20T12:00:00.000Z",
      clutchTimeEnabled: false,
    });
  });
});
