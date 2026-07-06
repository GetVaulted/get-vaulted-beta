import { describe, expect, it, vi, beforeEach } from "vitest";
import { reserveListingInventoryHoldTx, reserveHostLiveItemInventoryHoldTx } from "@/lib/live-auction-inventory-hold";

function fakeTx() {
  return {
    liveAuctionInventoryHold: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("reserveListingInventoryHoldTx — stale hold self-healing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks a different buyer while the existing hold has not expired", async () => {
    const tx = fakeTx();
    tx.liveAuctionInventoryHold.findFirst.mockResolvedValue({
      id: "hold_1",
      userId: "buyer_a",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      reserveListingInventoryHoldTx(tx, { listingId: "lst_1", userId: "buyer_b", source: "test" }),
    ).rejects.toThrow("LISTING_INVENTORY_HELD");
    expect(tx.liveAuctionInventoryHold.create).not.toHaveBeenCalled();
  });

  it("regression: an abandoned hold past its TTL no longer blocks a different buyer forever", async () => {
    const tx = fakeTx();
    tx.liveAuctionInventoryHold.findFirst.mockResolvedValue({
      id: "hold_1",
      userId: "buyer_a",
      expiresAt: new Date(Date.now() - 60_000), // expired 1 minute ago, never swept by the cron
    });

    await reserveListingInventoryHoldTx(tx, { listingId: "lst_1", userId: "buyer_b", source: "test" });

    expect(tx.liveAuctionInventoryHold.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "hold_1" }, data: expect.objectContaining({ status: "expired" }) }),
    );
    expect(tx.liveAuctionInventoryHold.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ listingId: "lst_1", userId: "buyer_b" }) }),
    );
  });

  it("same buyer refreshes a still-active hold without creating a duplicate", async () => {
    const tx = fakeTx();
    tx.liveAuctionInventoryHold.findFirst.mockResolvedValue({
      id: "hold_1",
      userId: "buyer_a",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await reserveListingInventoryHoldTx(tx, { listingId: "lst_1", userId: "buyer_a", source: "refresh" });

    expect(tx.liveAuctionInventoryHold.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "hold_1" }, data: expect.objectContaining({ source: "refresh" }) }),
    );
    expect(tx.liveAuctionInventoryHold.create).not.toHaveBeenCalled();
  });

  it("creates a fresh hold when none exists", async () => {
    const tx = fakeTx();
    tx.liveAuctionInventoryHold.findFirst.mockResolvedValue(null);

    await reserveListingInventoryHoldTx(tx, { listingId: "lst_1", userId: "buyer_a", source: "test" });

    expect(tx.liveAuctionInventoryHold.create).toHaveBeenCalled();
  });
});

describe("reserveHostLiveItemInventoryHoldTx — stale hold self-healing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("regression: an expired host-item hold no longer blocks a different host forever", async () => {
    const tx = fakeTx();
    tx.liveAuctionInventoryHold.findFirst.mockResolvedValue({
      id: "hold_2",
      userId: "host_a",
      expiresAt: new Date(Date.now() - 1_000),
    });

    await reserveHostLiveItemInventoryHoldTx(tx, { liveRoomItemId: "item_1", userId: "host_b", source: "test" });

    expect(tx.liveAuctionInventoryHold.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "hold_2" }, data: expect.objectContaining({ status: "expired" }) }),
    );
    expect(tx.liveAuctionInventoryHold.create).toHaveBeenCalled();
  });

  it("blocks a different host while the hold is still active", async () => {
    const tx = fakeTx();
    tx.liveAuctionInventoryHold.findFirst.mockResolvedValue({
      id: "hold_2",
      userId: "host_a",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      reserveHostLiveItemInventoryHoldTx(tx, { liveRoomItemId: "item_1", userId: "host_b", source: "test" }),
    ).rejects.toThrow("LIVE_ITEM_INVENTORY_HELD");
  });
});
