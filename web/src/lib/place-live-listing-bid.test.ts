import { beforeEach, describe, expect, it, vi } from "vitest";

const closeAuctionIfDue = vi.hoisted(() => vi.fn().mockResolvedValue(false));

vi.mock("@/lib/auction-close", () => ({
  closeAuctionIfDue,
}));

vi.mock("@/lib/server-transaction-now", () => ({
  getTransactionServerNow: vi.fn().mockResolvedValue(new Date("2026-08-07T02:00:00.000Z")),
}));

vi.mock("@/lib/proxy-auction", () => ({
  resolveProxyAuction: vi.fn().mockReturnValue({ leaderBidderId: null, displayUsd: 70 }),
}));

vi.mock("@/lib/auction", () => ({
  minNextBidUsd: (high: number) => Math.round((high + 1) * 100) / 100,
}));

import { placeLiveListingBid } from "@/lib/place-listing-bid";

function mockTx(listing: Record<string, unknown>) {
  return {
    listing: {
      findUnique: vi.fn().mockResolvedValue(listing),
      update: vi.fn().mockResolvedValue({}),
    },
    bid: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("placeLiveListingBid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a live bid even when marketplace listing.auctionEndsAt is already past", async () => {
    const staleEnd = new Date("2020-01-01T00:00:00.000Z");
    const tx = mockTx({
      id: "lst_1",
      title: "2 teams",
      sellerId: "seller_1",
      buyingFormat: "auction",
      status: "active",
      startingBidUsd: 70,
      currentBidUsd: null,
      priceUsd: 70,
      auctionEndsAt: staleEnd,
      moderationRemovedAt: null,
    });

    const result = await placeLiveListingBid(tx as never, {
      listingId: "lst_1",
      bidderId: "buyer_1",
      amountUsd: 70,
    });

    expect(result.youAreLeader).toBe(true);
    expect(result.amountUsd).toBe(70);
    expect(closeAuctionIfDue).not.toHaveBeenCalled();
    expect(tx.listing.update).toHaveBeenCalledWith({
      where: { id: "lst_1" },
      data: { currentBidUsd: 70, status: "auction_live" },
    });
  });

  it("rejects bids below the opening when no bids exist yet", async () => {
    const tx = mockTx({
      id: "lst_1",
      title: "2 teams",
      sellerId: "seller_1",
      buyingFormat: "auction",
      status: "active",
      startingBidUsd: 70,
      currentBidUsd: null,
      priceUsd: 70,
      auctionEndsAt: null,
      moderationRemovedAt: null,
    });

    await expect(
      placeLiveListingBid(tx as never, {
        listingId: "lst_1",
        bidderId: "buyer_1",
        amountUsd: 50,
      }),
    ).rejects.toThrow(/MIN_BID:70/);
  });
});
