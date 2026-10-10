import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { adminRefundActionsFor } from "./admin-refund-queue";

describe("adminRefundActionsFor", () => {
  it("lets support accept, deny or force an escalated request", () => {
    expect(adminRefundActionsFor("escalated")).toEqual(["approve", "deny", "force_refund"]);
  });
  it("only offers the override for requests still in the normal flow", () => {
    for (const s of ["pending_seller", "seller_denied", "awaiting_return", "return_in_transit"] as const) {
      expect(adminRefundActionsFor(s)).toEqual(["force_refund"]);
    }
  });
  it("offers only a retry for a stuck refund and nothing for closed requests", () => {
    expect(adminRefundActionsFor("refund_processing")).toEqual(["retry"]);
    expect(adminRefundActionsFor("refunded")).toEqual([]);
    expect(adminRefundActionsFor("support_denied")).toEqual([]);
  });
});
