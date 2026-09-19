import { describe, expect, it, vi } from "vitest";
import { minNextBidUsd } from "./auction";
import {
  clearLiveAuctionProxyBidsForItem,
  isLiveAuctionPreBidEligible,
  liveAuctionPreBidMinUsd,
  resolveLivePreBidVisiblePrice,
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

  it("sole max/pre-bid sits at opening — never jumps to the raw max", () => {
    expect(
      resolveLivePreBidVisiblePrice(1, [
        { userId: "buyer-a", maxAmountUsd: 34, tieTimeMs: 1 },
      ]),
    ).toEqual({ userId: "buyer-a", displayUsd: 1 });
  });

  it("competing maxes advance one increment above second place", () => {
    expect(
      resolveLivePreBidVisiblePrice(1, [
        { userId: "high", maxAmountUsd: 34, tieTimeMs: 2 },
        { userId: "second", maxAmountUsd: 10, tieTimeMs: 1 },
      ]),
    ).toEqual({ userId: "high", displayUsd: minNextBidUsd(10) });
  });

  it("clears all proxy rows for the item on unit reset", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const tx = { liveAuctionProxyBid: { deleteMany } };
    const n = await clearLiveAuctionProxyBidsForItem(tx as never, {
      liveRoomId: "room-1",
      itemId: "item-1",
    });
    expect(n).toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { liveRoomId: "room-1", liveRoomItemId: "item-1" },
    });
  });
});
