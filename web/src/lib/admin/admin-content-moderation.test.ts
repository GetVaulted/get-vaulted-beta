import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  sellerReview: { findUnique: vi.fn(), update: vi.fn() },
  liveRoomMessage: { findUnique: vi.fn(), update: vi.fn() },
  adminActionLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) } }));

import { ModerationError, setChatMessageDeleted, setReviewHidden } from "./admin-content-moderation";

beforeEach(() => vi.clearAllMocks());

describe("setReviewHidden", () => {
  it("hides a visible review and logs it against the seller", async () => {
    tx.sellerReview.findUnique.mockResolvedValue({ id: "r1", sellerId: "s1", buyerId: "b1", hiddenAt: null, rating: 1 });
    await setReviewHidden({ adminUserId: "a", reviewId: "r1", hidden: true, reason: "abusive language" });
    expect(tx.sellerReview.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { hiddenAt: expect.any(Date) } });
    expect(tx.adminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "review.hide", targetUserId: "s1" }) }),
    );
  });
  it("restores a hidden review by clearing hiddenAt", async () => {
    tx.sellerReview.findUnique.mockResolvedValue({ id: "r1", sellerId: "s1", buyerId: "b1", hiddenAt: new Date(), rating: 1 });
    await setReviewHidden({ adminUserId: "a", reviewId: "r1", hidden: false, reason: "hidden by mistake" });
    expect(tx.sellerReview.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { hiddenAt: null } });
  });
  it("refuses a no-op and writes nothing", async () => {
    tx.sellerReview.findUnique.mockResolvedValue({ id: "r1", sellerId: "s1", buyerId: "b1", hiddenAt: null, rating: 5 });
    await expect(setReviewHidden({ adminUserId: "a", reviewId: "r1", hidden: false, reason: "restore it" })).rejects.toMatchObject({ code: "NOT_HIDDEN" });
    expect(tx.sellerReview.update).not.toHaveBeenCalled();
    expect(tx.adminActionLog.create).not.toHaveBeenCalled();
  });
  it("404s a missing review", async () => {
    tx.sellerReview.findUnique.mockResolvedValue(null);
    await expect(setReviewHidden({ adminUserId: "a", reviewId: "x", hidden: true, reason: "spam review" })).rejects.toBeInstanceOf(ModerationError);
  });
});

describe("setChatMessageDeleted", () => {
  it("soft-deletes and records who did it", async () => {
    tx.liveRoomMessage.findUnique.mockResolvedValue({ id: "m1", senderId: "u1", liveRoomId: "r1", deletedAt: null });
    await setChatMessageDeleted({ adminUserId: "a", messageId: "m1", deleted: true, reason: "hate speech" });
    expect(tx.liveRoomMessage.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { deletedAt: expect.any(Date), deletedByUserId: "a" },
    });
  });
  it("restores and clears the deleter", async () => {
    tx.liveRoomMessage.findUnique.mockResolvedValue({ id: "m1", senderId: "u1", liveRoomId: "r1", deletedAt: new Date() });
    await setChatMessageDeleted({ adminUserId: "a", messageId: "m1", deleted: false, reason: "wrongly removed" });
    expect(tx.liveRoomMessage.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { deletedAt: null, deletedByUserId: null } });
  });
  it("won't delete twice", async () => {
    tx.liveRoomMessage.findUnique.mockResolvedValue({ id: "m1", senderId: "u1", liveRoomId: "r1", deletedAt: new Date() });
    await expect(setChatMessageDeleted({ adminUserId: "a", messageId: "m1", deleted: true, reason: "again again" })).rejects.toMatchObject({ code: "ALREADY_DELETED" });
  });
});
