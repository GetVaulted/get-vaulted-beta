import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin_1" }),
}));

const logTrustModerationAction = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/trust/moderation-audit-log", () => ({ logTrustModerationAction }));

const endLiveRoomsForSuspendedSeller = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ended: 0, cancelled: 0 }),
);
vi.mock("@/lib/seller-suspension-live-guard", () => ({ endLiveRoomsForSuspendedSeller }));

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PATCH } from "@/app/api/admin/users/[id]/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users/user_1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/users/[id] — audit logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "user_1" });
    endLiveRoomsForSuspendedSeller.mockResolvedValue({ ended: 0, cancelled: 0 });
  });

  it("writes an audit log entry when suspending a user", async () => {
    const res = await PATCH(buildRequest({ action: "suspend", reason: "fraud review" }), {
      params: Promise.resolve({ id: "user_1" }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user_1" }, data: expect.objectContaining({ suspendedAt: expect.any(Date) }) }),
    );
    expect(logTrustModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        action: "admin_user_suspended",
        targetType: "user",
        targetId: "user_1",
        detail: expect.objectContaining({ reason: "fraud review" }),
      }),
    );
  });

  it("writes an audit log entry when unsuspending a user", async () => {
    const res = await PATCH(buildRequest({ action: "unsuspend" }), {
      params: Promise.resolve({ id: "user_1" }),
    });

    expect(res.status).toBe(200);
    expect(logTrustModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        action: "admin_user_unsuspended",
        targetType: "user",
        targetId: "user_1",
      }),
    );
  });

  it("does not write an audit log entry for an invalid action", async () => {
    const res = await PATCH(buildRequest({ action: "bogus" }), {
      params: Promise.resolve({ id: "user_1" }),
    });

    expect(res.status).toBe(400);
    expect(logTrustModerationAction).not.toHaveBeenCalled();
  });
});
