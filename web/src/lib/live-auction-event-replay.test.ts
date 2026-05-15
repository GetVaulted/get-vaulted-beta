import { describe, expect, it } from "vitest";
import { LIVE_AUCTION_EVENT_PAYLOAD_VERSION } from "@/lib/live-auction-event-schema";
import { replayLiveAuctionBidPlacedEvents } from "@/lib/live-auction-event-replay";

describe("replayLiveAuctionBidPlacedEvents", () => {
  const basePayload = (over: Partial<Record<string, unknown>>) =>
    ({
      v: LIVE_AUCTION_EVENT_PAYLOAD_VERSION,
      liveRoomId: "room1",
      itemId: "item1",
      amountUsd: 10,
      bidderId: "u1",
      listingId: null,
      roomVersion: 1,
      itemVersion: 1,
      auctionEndsAt: null,
      biddingOpen: true,
      leadingBidderId: "u1",
      leadingBidderUsername: "a",
      clutchTimeEnabled: false,
      emitActiveItemChanged: false,
      ...over,
    });

  it("orders by seq, not insert order", () => {
    const state = replayLiveAuctionBidPlacedEvents([
      { seq: 3, eventType: "bid_placed", payload: basePayload({ amountUsd: 30, roomVersion: 3, leadingBidderId: "u3" }) },
      { seq: 1, eventType: "bid_placed", payload: basePayload({ amountUsd: 10, roomVersion: 1, leadingBidderId: "u1" }) },
      { seq: 2, eventType: "bid_placed", payload: basePayload({ amountUsd: 20, roomVersion: 2, leadingBidderId: "u2" }) },
    ]);
    expect(state.byItemId.item1?.amountUsd).toBe(30);
    expect(state.byItemId.item1?.leadingBidderId).toBe("u3");
    expect(state.roomVersion).toBe(3);
  });

  it("tracks multiple items independently", () => {
    const state = replayLiveAuctionBidPlacedEvents([
      { seq: 1, eventType: "bid_placed", payload: basePayload({ itemId: "a", amountUsd: 5 }) },
      { seq: 2, eventType: "bid_placed", payload: basePayload({ itemId: "b", amountUsd: 7 }) },
      { seq: 3, eventType: "bid_placed", payload: basePayload({ itemId: "a", amountUsd: 9 }) },
    ]);
    expect(state.byItemId.a?.amountUsd).toBe(9);
    expect(state.byItemId.b?.amountUsd).toBe(7);
  });

  it("ignores unknown event types", () => {
    const state = replayLiveAuctionBidPlacedEvents([
      { seq: 1, eventType: "system_ping", payload: {} },
      { seq: 2, eventType: "bid_placed", payload: basePayload({ amountUsd: 12 }) },
    ]);
    expect(state.byItemId.item1?.amountUsd).toBe(12);
  });
});
