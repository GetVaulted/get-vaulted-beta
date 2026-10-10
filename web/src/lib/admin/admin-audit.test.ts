import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { adminActionLog: { create: vi.fn() } } }));

import { ADMIN_REASON_MIN_LENGTH, logAdminAction, normalizeAdminReason } from "./admin-audit";

describe("normalizeAdminReason", () => {
  it("rejects missing, non-string and too-short reasons", () => {
    expect(normalizeAdminReason(undefined)).toBeNull();
    expect(normalizeAdminReason(42)).toBeNull();
    expect(normalizeAdminReason("   ab ")).toBeNull();
  });
  it("trims and accepts a real reason", () => {
    expect(normalizeAdminReason("  buyer asked for refund  ")).toBe("buyer asked for refund");
    expect("12345".length).toBe(ADMIN_REASON_MIN_LENGTH);
    expect(normalizeAdminReason("12345")).toBe("12345");
  });
});

describe("logAdminAction", () => {
  it("writes through the supplied transaction client with trimmed fields", async () => {
    const create = vi.fn().mockResolvedValue({ id: "x" });
    await logAdminAction(
      { adminUserId: "a1", action: "refund.approve", targetType: "refund_request", targetId: "r1", targetUserId: "u1", reason: "  ok then  " },
      { adminActionLog: { create } } as never,
    );
    expect(create).toHaveBeenCalledWith({
      data: {
        adminUserId: "a1",
        action: "refund.approve",
        targetType: "refund_request",
        targetId: "r1",
        targetUserId: "u1",
        reason: "ok then",
        detail: undefined,
      },
    });
  });
});
