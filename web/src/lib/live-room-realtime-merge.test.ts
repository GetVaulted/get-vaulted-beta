import { describe, expect, it } from "vitest";
import { mergeLiveRoomItemsForBidPlaced, type BidPlacedPayload } from "@/lib/live-room-realtime-merge";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

function item(overrides: Partial<LiveRoomItemDTO> = {}): LiveRoomItemDTO {
  return {
    id: "item_1",
    title: "Lot",
    status: "active",
    sortOrder: 0,
    quantity: 2,
    quantityInitial: 2,
    currentBidUsd: 34,
    startingBidUsd: 1,
    priceUsd: 1,
    lastHighBidderId: "user_old",
    lastHighBidderUsername: "oldwinner",
    biddingOpen: true,
    auctionEndsAt: null,
    itemVersion: 10,
    salesFormat: "auction",
    listingId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as LiveRoomItemDTO;
}

describe("mergeLiveRoomItemsForBidPlaced", () => {
  it("applies the event amount even when lower than a stale prior-unit high", () => {
    const payload: BidPlacedPayload = {
      itemId: "item_1",
      amountUsd: 2,
      itemVersion: 12,
      leadingBidderId: "user_new",
      leadingBidderUsername: "newbidder",
    };
    const [next] = mergeLiveRoomItemsForBidPlaced([item()], payload);
    expect(next?.currentBidUsd).toBe(2);
    expect(next?.lastHighBidderId).toBe("user_new");
    expect(next?.itemVersion).toBe(12);
  });

  it("ignores stale events with an older itemVersion", () => {
    const payload: BidPlacedPayload = {
      itemId: "item_1",
      amountUsd: 99,
      itemVersion: 8,
      leadingBidderId: "stale",
    };
    const [next] = mergeLiveRoomItemsForBidPlaced([item({ currentBidUsd: 3, itemVersion: 12 })], payload);
    expect(next?.currentBidUsd).toBe(3);
    expect(next?.lastHighBidderId).toBe("user_old");
  });
});
