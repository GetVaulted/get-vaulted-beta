import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { getSellerApprovalIssue, getSellerApprovalState, isSellerApplicationsEnforced } from "@/lib/seller-approval";

describe("seller approval gate", () => {
  const prev = process.env.SELLER_APPLICATIONS_ENFORCED;
  beforeEach(() => {
    findUnique.mockReset();
    delete process.env.SELLER_APPLICATIONS_ENFORCED;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.SELLER_APPLICATIONS_ENFORCED;
    else process.env.SELLER_APPLICATIONS_ENFORCED = prev;
  });

  it("is off by default and never touches the database", async () => {
    expect(isSellerApplicationsEnforced()).toBe(false);
    expect(await getSellerApprovalIssue("u1")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("blocks users with no application / pending / rejected once enforced", async () => {
    process.env.SELLER_APPLICATIONS_ENFORCED = "1";
    findUnique.mockResolvedValueOnce({ role: "user", sellerApplication: null });
    expect(await getSellerApprovalIssue("u1")).toMatch(/Apply to sell/);
    findUnique.mockResolvedValueOnce({ role: "user", sellerApplication: { status: "pending" } });
    expect(await getSellerApprovalIssue("u1")).toMatch(/under review/);
    findUnique.mockResolvedValueOnce({ role: "user", sellerApplication: { status: "rejected" } });
    expect(await getSellerApprovalIssue("u1")).toMatch(/wasn't approved/);
  });

  it("lets approved sellers and admins through", async () => {
    process.env.SELLER_APPLICATIONS_ENFORCED = "true";
    findUnique.mockResolvedValueOnce({ role: "user", sellerApplication: { status: "approved" } });
    expect(await getSellerApprovalIssue("u1")).toBeNull();
    findUnique.mockResolvedValueOnce({ role: "admin", sellerApplication: null });
    expect(await getSellerApprovalIssue("a1")).toBeNull();
    findUnique.mockResolvedValueOnce({ role: "user", sellerApplication: { status: "revoked" } });
    expect(await getSellerApprovalIssue("u1")).toMatch(/paused/);
  });

  it("fails open if the lookup throws", async () => {
    process.env.SELLER_APPLICATIONS_ENFORCED = "1";
    findUnique.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getSellerApprovalIssue("u1")).toBeNull();
    spy.mockRestore();
  });

  it("treats a missing user as not applied", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await getSellerApprovalState("ghost")).toBe("not_applied");
  });
});
