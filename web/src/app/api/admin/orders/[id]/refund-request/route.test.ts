import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin_1" }) }));
const svc = vi.hoisted(() => ({
  adminOpenRefundRequest: vi.fn().mockResolvedValue({ id: "r1", status: "escalated" }),
  RefundRequestError: class extends Error {
    constructor(public code: string, public status: number) {
      super(code);
    }
  },
}));
vi.mock("@/services/order-refund-request", () => svc);
const prismaMock = vi.hoisted(() => ({
  order: { findUnique: vi.fn().mockResolvedValue({ buyerId: "buyer_1" }) },
  orderRefundRequest: { findMany: vi.fn().mockResolvedValue([]) },
  adminActionLog: { create: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "./route";

const call = (body: unknown) =>
  POST(new Request("http://x/api/admin/orders/o1/refund-request", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "o1" }),
  });

describe("POST /api/admin/orders/[id]/refund-request", () => {
  beforeEach(() => vi.clearAllMocks());

  it("needs a reason and a valid kind before opening anything", async () => {
    expect((await call({ kind: "cancel", reason: "no" })).status).toBe(400);
    expect((await call({ kind: "refund", reason: "buyer asked nicely" })).status).toBe(400);
    expect(svc.adminOpenRefundRequest).not.toHaveBeenCalled();
  });

  it("opens the request and logs it against the buyer", async () => {
    const res = await call({ kind: "cancel", reason: "buyer asked nicely" });
    expect(res.status).toBe(200);
    expect(svc.adminOpenRefundRequest).toHaveBeenCalledWith({
      orderId: "o1",
      adminUserId: "admin_1",
      kind: "cancel",
      reason: "buyer asked nicely",
    });
    expect(prismaMock.adminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "refund.open", targetUserId: "buyer_1" }) }),
    );
  });

  it("passes through service errors such as an already-open request", async () => {
    svc.adminOpenRefundRequest.mockRejectedValueOnce(new svc.RefundRequestError("REQUEST_ALREADY_OPEN", 409));
    const res = await call({ kind: "cancel", reason: "buyer asked nicely" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("REQUEST_ALREADY_OPEN");
  });
});
