import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  SELLER_LOCKED_PAYOUT_REASON,
  SELLER_LOCK_PUBLIC_MESSAGE,
  getSellerLock,
  isSellerLocked,
  normalizeSellerLockReason,
  sellerLockFromRow,
} from "@/lib/seller-lock";

describe("seller lock helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads unlocked when no lock timestamp is set", () => {
    expect(sellerLockFromRow({ sellerLockedAt: null, sellerLockReason: "stale" })).toEqual({
      locked: false,
      lockedAt: null,
      reason: null,
      lockedById: null,
    });
    expect(sellerLockFromRow(null).locked).toBe(false);
    expect(sellerLockFromRow(undefined).locked).toBe(false);
  });

  it("reads locked with reason and admin when a lock timestamp is set", () => {
    const at = new Date("2026-10-25T12:00:00Z");
    expect(
      sellerLockFromRow({ sellerLockedAt: at, sellerLockReason: "open dispute", sellerLockedById: "admin_1" }),
    ).toEqual({ locked: true, lockedAt: at, reason: "open dispute", lockedById: "admin_1" });
  });

  it("getSellerLock / isSellerLocked read the User row", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      sellerLockedAt: new Date(),
      sellerLockReason: "x".repeat(6),
      sellerLockedById: "admin_1",
    });
    expect((await getSellerLock("seller_1")).locked).toBe(true);
    expect(await isSellerLocked("seller_1")).toBe(true);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "seller_1" } }),
    );

    prismaMock.user.findUnique.mockResolvedValue({ sellerLockedAt: null });
    expect(await isSellerLocked("seller_1")).toBe(false);
  });

  it("treats a missing user or blank id as unlocked without querying for a blank id", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect((await getSellerLock("ghost")).locked).toBe(false);
    prismaMock.user.findUnique.mockClear();
    expect((await getSellerLock("  ")).locked).toBe(false);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("requires a meaningful reason", () => {
    expect(normalizeSellerLockReason("no")).toBeNull();
    expect(normalizeSellerLockReason("    ")).toBeNull();
    expect(normalizeSellerLockReason(42)).toBeNull();
    expect(normalizeSellerLockReason("  chargeback review  ")).toBe("chargeback review");
    expect(normalizeSellerLockReason("y".repeat(2000))).toHaveLength(1000);
  });

  it("never exposes the admin's reason in seller-facing text", () => {
    expect(SELLER_LOCK_PUBLIC_MESSAGE).not.toMatch(/dispute|chargeback|fraud/i);
    expect(SELLER_LOCKED_PAYOUT_REASON).toBe("seller_locked");
  });
});
