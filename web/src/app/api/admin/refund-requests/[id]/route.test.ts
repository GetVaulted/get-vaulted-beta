import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin_1" }),
}));
const svc = vi.hoisted(() => ({
  adminForceRefundRequest: vi.fn().mockResolvedValue({ id: "r1", orderId: "o1", status: "refunded" }),
  supportResolveRefundRequest: vi.fn().mockResolvedValue({ id: "r1", orderId: "o1", status: "refunded" }),
  RefundRequestError: class extends Error {
    constructor(public code: string, public status: number) {
      super(code);
    }
  },
}));
vi.mock("@/services/order-refund-request", () => svc);
const prismaMock = vi.hoisted(() => ({
  orderRefundRequest: { findUnique: vi.fn().mockResolvedValue({ buyerId: "buyer_1" }) },
  adminActionLog: { create: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PATCH } from "./route";

const call = (body: unknown) =>
  PATCH(new Request("http://x/api/admin/refund-requests/r1", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "r1" }),
  });

describe("PATCH /api/admin/refund-requests/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects any decision without a written reason and moves no money", async () => {
    for (const body of [{ approve: true }, { action: "force_refund" }, { approve: false, note: "no" }]) {
      const res = await call(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("REASON_REQUIRED");
    }
    expect(svc.adminForceRefundRequest).not.toHaveBeenCalled();
    expect(svc.supportResolveRefundRequest).not.toHaveBeenCalled();
  });

  it("force refund passes the reason through and writes the activity log", async () => {
    const res = await call({ action: "force_refund", note: "buyer never received item" });
    expect(res.status).toBe(200);
    expect(svc.adminForceRefundRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "r1", adminUserId: "admin_1", note: "buyer never received item" }),
    );
    expect(prismaMock.adminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "refund.force", targetUserId: "buyer_1", reason: "buyer never received item" }),
      }),
    );
  });

  it("approve and deny are logged with their own action names", async () => {
    await call({ approve: true, note: "seller agreed in chat" });
    await call({ approve: false, note: "item was delivered" });
    const actions = prismaMock.adminActionLog.create.mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual(["refund.approve", "refund.deny"]);
  });
});
