import { beforeEach, describe, expect, it, vi } from "vitest";
import { upsertLiveAuctionProxyBid } from "./resolve-live-proxy-bid-chain";

describe("upsertLiveAuctionProxyBid", () => {
  const upsert = vi.fn();

  beforeEach(() => {
    upsert.mockReset();
  });

  it("does not upsert when a marketplace listingId is set", async () => {
    const tx = { liveAuctionProxyBid: { upsert } };
    await upsertLiveAuctionProxyBid(tx as never, {
      liveRoomId: "room",
      liveRoomItemId: "item",
      userId: "user",
      maxAmountUsd: 99,
      listingId: "listing_1",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts for host-only items", async () => {
    const tx = { liveAuctionProxyBid: { upsert } };
    await upsertLiveAuctionProxyBid(tx as never, {
      liveRoomId: "room",
      liveRoomItemId: "item",
      userId: "user",
      maxAmountUsd: 120,
      listingId: null,
    });
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
