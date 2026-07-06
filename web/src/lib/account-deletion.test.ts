import { beforeEach, describe, expect, it, vi } from "vitest";

// Legal/compliance audit (2026-07): account deletion previously left PushDeviceToken rows
// tied to a "deleted" user, so push notifications could still be sent after deletion. This
// verifies deletion also revokes push tokens (GDPR/CCPA erasure alignment).

const findUnique = vi.fn();
const userUpdate = vi.fn().mockResolvedValue({});
const listingUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const notificationUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const orderCount = vi.fn().mockResolvedValue(0);
const liveRoomCount = vi.fn().mockResolvedValue(0);
const reportCount = vi.fn().mockResolvedValue(0);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    order: { count: (...a: unknown[]) => orderCount(...a) },
    liveRoom: { count: (...a: unknown[]) => liveRoomCount(...a) },
    report: { count: (...a: unknown[]) => reportCount(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        user: { update: (...a: unknown[]) => userUpdate(...a) },
        listing: { updateMany: (...a: unknown[]) => listingUpdateMany(...a) },
        notification: { updateMany: (...a: unknown[]) => notificationUpdateMany(...a) },
      }),
  },
}));

const revokeSupabaseAuthUser = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/supabase-admin", () => ({
  revokeSupabaseAuthUser: (...a: unknown[]) => revokeSupabaseAuthUser(...a),
}));

const revokeExpoPushTokensForUser = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/push/push-device-token", () => ({
  revokeExpoPushTokensForUser: (...a: unknown[]) => revokeExpoPushTokensForUser(...a),
}));

import { deleteUserAccount } from "./account-deletion";

describe("deleteUserAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderCount.mockResolvedValue(0);
    liveRoomCount.mockResolvedValue(0);
    reportCount.mockResolvedValue(0);
    userUpdate.mockResolvedValue({});
  });

  it("revokes push tokens for the deleted user so they stop receiving notifications", async () => {
    findUnique
      .mockResolvedValueOnce({ accountDeletedAt: null, stripePayoutsEnabled: false, stripeAccountId: null })
      .mockResolvedValueOnce({ id: "user_1", accountDeletedAt: null });

    const result = await deleteUserAccount("user_1");

    expect(result).toEqual({ ok: true });
    expect(revokeExpoPushTokensForUser).toHaveBeenCalledWith({ userId: "user_1" });
  });

  it("does not fail deletion if push token revocation throws", async () => {
    findUnique
      .mockResolvedValueOnce({ accountDeletedAt: null, stripePayoutsEnabled: false, stripeAccountId: null })
      .mockResolvedValueOnce({ id: "user_1", accountDeletedAt: null });
    revokeExpoPushTokensForUser.mockRejectedValueOnce(new Error("boom"));

    const result = await deleteUserAccount("user_1");

    expect(result).toEqual({ ok: true });
  });

  it("does not proceed (or revoke tokens) when deletion blockers exist", async () => {
    findUnique.mockResolvedValueOnce({ accountDeletedAt: null, stripePayoutsEnabled: false, stripeAccountId: null });
    orderCount.mockResolvedValue(1);

    const result = await deleteUserAccount("user_1");

    expect(result.ok).toBe(false);
    expect(revokeExpoPushTokensForUser).not.toHaveBeenCalled();
  });
});
