import { describe, expect, it } from "vitest";
import {
  resolveAdminRole,
  roleCanApproveRefundAmount,
  roleHasPermission,
  SUPPORT_REFUND_CAP_CENTS,
} from "./admin-permissions";

describe("admin permissions", () => {
  it("treats a null admin role as owner so existing admins keep full access", () => {
    expect(resolveAdminRole(null)).toBe("owner");
    expect(roleHasPermission(resolveAdminRole(null), "team.manage")).toBe(true);
  });
  it("gives unknown roles no access", () => {
    expect(resolveAdminRole("wizard")).toBeNull();
    expect(roleHasPermission(resolveAdminRole("wizard"), "users.message")).toBe(false);
  });
  it("limits each role", () => {
    expect(roleHasPermission("support", "payouts.manage")).toBe(false);
    expect(roleHasPermission("finance", "content.moderate")).toBe(false);
    expect(roleHasPermission("moderator", "refunds.decide")).toBe(false);
    expect(roleHasPermission("finance", "payouts.manage")).toBe(true);
    expect(roleHasPermission("moderator", "team.manage")).toBe(false);
  });
  it("caps support refunds", () => {
    expect(roleCanApproveRefundAmount("support", SUPPORT_REFUND_CAP_CENTS)).toBe(true);
    expect(roleCanApproveRefundAmount("support", SUPPORT_REFUND_CAP_CENTS + 1)).toBe(false);
    expect(roleCanApproveRefundAmount("finance", 500_000)).toBe(true);
    expect(roleCanApproveRefundAmount("moderator", 100)).toBe(false);
  });
});
