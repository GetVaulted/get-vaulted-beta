import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({
  current: { ok: true, userId: "admin_1", role: "owner" } as any,
}));
vi.mock("@/lib/admin/admin-permissions", () => ({
  requireAdminPermission: vi.fn(async () => gate.current),
}));

const logAdminAction = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction }));

const logTrustModerationAction = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/trust/moderation-audit-log", () => ({ logTrustModerationAction }));

const endLiveRoomsForSuspendedSeller = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ended: 1, cancelled: 0 }),
);
vi.mock("@/lib/seller-suspension-live-guard", () => ({ endLiveRoomsForSuspendedSeller }));

const ensureSellerStripeManualPayouts = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/seller-stripe-connect", () => ({ ensureSellerStripeManualPayouts }));
vi.mock("@/lib/stripe", () => ({ isStripeConfigured: () => true, getStripe: () => ({}) }));

const tx = vi.hoisted(() => ({ user: { update: vi.fn().mockResolvedValue(undefined) } }));
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET, PATCH } from "@/app/api/admin/users/[id]/seller-lock/route";

const ctx = { params: Promise.resolve({ id: "seller_1" }) };
const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/admin/users/seller_1/seller-lock", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    ctx,
  );

const unlockedSeller = {
  id: "seller_1",
  username: "j_a_sportsent",
  sellerLockedAt: null,
  sellerLockReason: null,
  sellerLockedById: null,
  stripeAccountId: "acct_1",
};

describe("PATCH /api/admin/users/[id]/seller-lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.current = { ok: true, userId: "admin_1", role: "owner" };
    prismaMock.user.findUnique.mockResolvedValue(unlockedSeller);
    endLiveRoomsForSuspendedSeller.mockResolvedValue({ ended: 1, cancelled: 0 });
    ensureSellerStripeManualPayouts.mockResolvedValue(undefined);
  });

  it("locks: sets the flag, audits in the same transaction, ends live shows, confirms manual payouts", async () => {
    const res = await patch({ action: "lock", reason: "Open dispute on unshipped orders" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      locked: true,
      liveShowsEnded: 1,
      stripePayoutScheduleManual: true,
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "seller_1" },
      data: expect.objectContaining({
        sellerLockedAt: expect.any(Date),
        sellerLockReason: "Open dispute on unshipped orders",
        sellerLockedById: "admin_1",
      }),
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "seller.lock", targetUserId: "seller_1", adminUserId: "admin_1" }),
      tx,
    );
    expect(endLiveRoomsForSuspendedSeller).toHaveBeenCalledWith("seller_1");
    expect(ensureSellerStripeManualPayouts).toHaveBeenCalledWith(expect.anything(), "acct_1");
    expect(logTrustModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin_seller_locked" }),
    );
  });

  it("reports when the Stripe payout schedule could not be confirmed, but still locks", async () => {
    ensureSellerStripeManualPayouts.mockRejectedValue(new Error("stripe down"));
    const res = await patch({ action: "lock", reason: "Open dispute on unshipped orders" });
    expect(res.status).toBe(200);
    expect((await res.json()).stripePayoutScheduleManual).toBe(false);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
  });

  it("still locks if ending live shows fails", async () => {
    endLiveRoomsForSuspendedSeller.mockRejectedValue(new Error("boom"));
    const res = await patch({ action: "lock", reason: "Open dispute on unshipped orders" });
    expect(res.status).toBe(200);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
  });

  it("locking an already-locked seller does not overwrite the original lock", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...unlockedSeller,
      sellerLockedAt: new Date("2026-10-20T00:00:00Z"),
      sellerLockReason: "original reason",
      sellerLockedById: "admin_9",
    });
    const res = await patch({ action: "lock", reason: "second attempt here" });
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyLocked).toBe(true);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("unlocks: clears all three fields and audits", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...unlockedSeller,
      sellerLockedAt: new Date("2026-10-20T00:00:00Z"),
      sellerLockReason: "original reason",
      sellerLockedById: "admin_9",
    });
    const res = await patch({ action: "unlock", reason: "Situation resolved with seller" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, locked: false });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "seller_1" },
      data: { sellerLockedAt: null, sellerLockReason: null, sellerLockedById: null },
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "seller.unlock", reason: "Situation resolved with seller" }),
      tx,
    );
    expect(endLiveRoomsForSuspendedSeller).not.toHaveBeenCalled();
  });

  it("requires a reason", async () => {
    const res = await patch({ action: "lock", reason: "no" });
    expect(res.status).toBe(400);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("rejects unknown actions and self-lock", async () => {
    expect((await patch({ action: "nuke", reason: "something long" })).status).toBe(400);
    gate.current = { ok: true, userId: "seller_1", role: "owner" };
    expect((await patch({ action: "lock", reason: "something long" })).status).toBe(400);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("404s for an unknown user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect((await patch({ action: "lock", reason: "something long" })).status).toBe(404);
  });

  it("returns the permission response untouched when the admin is not allowed", async () => {
    gate.current = { ok: false, response: new Response(JSON.stringify({ error: "nope" }), { status: 403 }) };
    const res = await patch({ action: "lock", reason: "something long" });
    expect(res.status).toBe(403);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/users/[id]/seller-lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.current = { ok: true, userId: "admin_1", role: "owner" };
  });

  it("reports an unlocked seller", async () => {
    prismaMock.user.findUnique.mockResolvedValue(unlockedSeller);
    const res = await GET(new Request("http://localhost/x"), ctx);
    expect(await res.json()).toMatchObject({ locked: false, lockedAt: null, reason: null });
  });

  it("reports a locked seller with who locked it", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        ...unlockedSeller,
        sellerLockedAt: new Date("2026-10-20T00:00:00Z"),
        sellerLockReason: "original reason",
        sellerLockedById: "admin_9",
      })
      .mockResolvedValueOnce({ username: "bryan" });
    const json = await (await GET(new Request("http://localhost/x"), ctx)).json();
    expect(json).toMatchObject({
      locked: true,
      reason: "original reason",
      lockedByUsername: "bryan",
      lockedAt: "2026-10-20T00:00:00.000Z",
    });
  });
});
