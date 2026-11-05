import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lotFindUnique: vi.fn(),
  itemUpdateMany: vi.fn(),
  itemFindUnique: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoomItem: { findUnique: mocks.lotFindUnique },
    liveShippingSessionItem: { updateMany: mocks.itemUpdateMany, findUnique: mocks.itemFindUnique },
  },
}));
vi.mock("@/services/shipping/live-shipping-quote", () => ({
  refreshLiveShippingSessionShippoEstimate: mocks.refresh,
}));

import { applySurpriseSetRevealWeightToShipping } from "@/services/shipping/surprise-set-shipping-weight";

const stored = [
  { name: "Helmet", quantity: 3, msrpUsd: 90, weightOz: 60 },
  { name: "Card pack", quantity: 7, msrpUsd: 90 },
];

describe("applySurpriseSetRevealWeightToShipping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lotFindUnique.mockResolvedValue({ surpriseSetItems: stored });
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });
    mocks.itemFindUnique.mockResolvedValue({ sessionId: "sess-1" });
    mocks.refresh.mockResolvedValue(undefined);
  });

  it("writes the drawn item's weight onto the buyer's shipping session item and refreshes the estimate", async () => {
    const r = await applySurpriseSetRevealWeightToShipping({
      fulfillmentOrderId: "ord-1",
      liveRoomItemId: "lot-1",
      revealedLabel: "Helmet (2 of 3)",
    });
    expect(r).toEqual({ applied: true, weightOz: 60 });
    expect(mocks.itemUpdateMany).toHaveBeenCalledWith({ where: { orderId: "ord-1" }, data: { appliedWeightOz: 60 } });
    expect(mocks.refresh).toHaveBeenCalledWith("sess-1");
  });

  it("does nothing for an item with no declared weight (keeps the show's default spot weight)", async () => {
    const r = await applySurpriseSetRevealWeightToShipping({
      fulfillmentOrderId: "ord-1",
      liveRoomItemId: "lot-1",
      revealedLabel: "Card pack (1 of 7)",
    });
    expect(r.applied).toBe(false);
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("does nothing when the purchase has no fulfillment order", async () => {
    const r = await applySurpriseSetRevealWeightToShipping({
      fulfillmentOrderId: null,
      liveRoomItemId: "lot-1",
      revealedLabel: "Helmet (1 of 3)",
    });
    expect(r.applied).toBe(false);
    expect(mocks.lotFindUnique).not.toHaveBeenCalled();
  });

  it("never throws, and keeps the saved weight, if the estimate refresh fails", async () => {
    mocks.refresh.mockRejectedValue(new Error("shippo down"));
    const r = await applySurpriseSetRevealWeightToShipping({
      fulfillmentOrderId: "ord-1",
      liveRoomItemId: "lot-1",
      revealedLabel: "Helmet (1 of 3)",
    });
    expect(r.applied).toBe(true);
    mocks.lotFindUnique.mockRejectedValue(new Error("db down"));
    await expect(
      applySurpriseSetRevealWeightToShipping({ fulfillmentOrderId: "ord-1", liveRoomItemId: "lot-1", revealedLabel: "Helmet (1 of 3)" }),
    ).resolves.toEqual({ applied: false, weightOz: null });
  });
});
