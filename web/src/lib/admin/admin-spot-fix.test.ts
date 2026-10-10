import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  liveItemVariantPurchase: { findUnique: vi.fn(), update: vi.fn() },
  liveItemVariant: { findUnique: vi.fn(), update: vi.fn() },
  liveRoomItem: { update: vi.fn() },
  liveRoom: { update: vi.fn() },
  user: { findFirst: vi.fn() },
  adminActionLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) },
}));

import { releaseSpot, reassignSpotBuyer, SpotFixError } from "./admin-spot-fix";

const base = {
  id: "p1",
  buyerId: "b1",
  liveRoomId: "r1",
  liveRoomItemId: "i1",
  variantId: "v1",
  quantity: 1,
  paymentStatus: "paid",
  fulfillmentOrderId: null,
  stripePaymentIntentId: null,
  revealedLabel: "Cowboys",
  revealedAbbr: "DAL",
};

describe("reassignSpotBuyer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a spot that already has an order", async () => {
    tx.liveItemVariantPurchase.findUnique.mockResolvedValue({ ...base, fulfillmentOrderId: "o1" });
    await expect(
      reassignSpotBuyer({ adminUserId: "a", purchaseId: "p1", toUsername: "x", reason: "wrong buyer" }),
    ).rejects.toMatchObject({ code: "ORDER_EXISTS" });
    expect(tx.liveItemVariantPurchase.update).not.toHaveBeenCalled();
  });

  it("needs an explicit acknowledgement for card-paid spots", async () => {
    tx.liveItemVariantPurchase.findUnique.mockResolvedValue({ ...base, stripePaymentIntentId: "pi_1" });
    await expect(
      reassignSpotBuyer({ adminUserId: "a", purchaseId: "p1", toUsername: "x", reason: "wrong buyer" }),
    ).rejects.toMatchObject({ code: "PAID_ON_PLATFORM_NEEDS_ACK" });
  });

  it("moves the spot, bumps versions and writes the log", async () => {
    tx.liveItemVariantPurchase.findUnique.mockResolvedValue(base);
    tx.user.findFirst.mockResolvedValue({ id: "b2", username: "kem", suspendedAt: null });
    const out = await reassignSpotBuyer({ adminUserId: "a", purchaseId: "p1", toUsername: "@Kem", reason: "wrong buyer" });
    expect(out).toMatchObject({ buyerId: "b2", username: "kem" });
    expect(tx.liveItemVariantPurchase.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { buyerId: "b2" } });
    expect(tx.adminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "spot.reassign_buyer", targetUserId: "b2" }) }),
    );
  });

  it("rejects suspended targets and no-op moves", async () => {
    tx.liveItemVariantPurchase.findUnique.mockResolvedValue(base);
    tx.user.findFirst.mockResolvedValueOnce({ id: "b2", username: "kem", suspendedAt: new Date() });
    await expect(reassignSpotBuyer({ adminUserId: "a", purchaseId: "p1", toUsername: "kem", reason: "wrong buyer" })).rejects.toBeInstanceOf(SpotFixError);
    tx.user.findFirst.mockResolvedValueOnce({ id: "b1", username: "same", suspendedAt: null });
    await expect(reassignSpotBuyer({ adminUserId: "a", purchaseId: "p1", toUsername: "same", reason: "wrong buyer" })).rejects.toMatchObject({ code: "SAME_BUYER" });
  });
});

describe("releaseSpot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("will not release a card-paid spot (that needs a refund)", async () => {
    tx.liveItemVariantPurchase.findUnique.mockResolvedValue({ ...base, stripePaymentIntentId: "pi_1" });
    await expect(releaseSpot({ adminUserId: "a", purchaseId: "p1", reason: "mistake" })).rejects.toMatchObject({
      code: "CARD_PAID_USE_REFUND",
    });
    expect(tx.liveItemVariant.update).not.toHaveBeenCalled();
  });

  it("restores stock, reopens a sold-out variant and clears the reveal", async () => {
    tx.liveItemVariantPurchase.findUnique.mockResolvedValue(base);
    tx.liveItemVariant.findUnique.mockResolvedValue({ quantityInitial: 1, quantityRemaining: 0, soldCount: 1, status: "sold_out" });
    await releaseSpot({ adminUserId: "a", purchaseId: "p1", reason: "sold in error" });
    expect(tx.liveItemVariant.update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { quantityRemaining: 1, soldCount: 0, status: "available" },
    });
    expect(tx.liveItemVariantPurchase.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { paymentStatus: "cancelled", revealedLabel: null, revealedAbbr: null },
    });
  });

  it("does not touch soldCount for an unpaid spot and never exceeds the initial quantity", async () => {
    tx.liveItemVariantPurchase.findUnique.mockResolvedValue({ ...base, paymentStatus: "pending_payment" });
    tx.liveItemVariant.findUnique.mockResolvedValue({ quantityInitial: 1, quantityRemaining: 1, soldCount: 0, status: "available" });
    await releaseSpot({ adminUserId: "a", purchaseId: "p1", reason: "sold in error" });
    expect(tx.liveItemVariant.update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { quantityRemaining: 1, soldCount: 0, status: "available" },
    });
  });
});
