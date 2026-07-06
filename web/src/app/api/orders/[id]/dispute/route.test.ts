import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  authOptions: {},
  getServerSessionSafe: vi.fn().mockResolvedValue({ user: { id: "buyer_1" } }),
}));

const logEscrowStatusTransition = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/escrow-audit-log", () => ({ logEscrowStatusTransition }));

const createNotification = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/notifications", () => ({ createNotification }));

const prismaMock = vi.hoisted(() => ({
  order: {
    findFirst: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getServerSessionSafe } from "@/lib/auth";
import { POST } from "@/app/api/orders/[id]/dispute/route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const baseOrder = {
  id: "ord_1",
  sellerId: "seller_1",
  listingId: "lst_1",
  paymentMethod: "escrow",
  escrowStatus: "buyer_paid",
  escrowProvider: "trustap",
  escrowTransactionId: "tx_1",
  listing: { title: "Vintage Card" },
};

describe("POST /api/orders/[id]/dispute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "buyer_1" } } as never);
    prismaMock.order.findFirst.mockResolvedValue(baseOrder);
  });

  // FIX 4 (HIGH): opening a dispute previously only touched the DB/audit log — the seller got no
  // in-app/push signal at all. Must notify the seller with a link to their order/dispute view.
  it("notifies the seller when a dispute is opened, linking to their seller order page", async () => {
    const res = await POST(new Request("http://localhost/api/orders/ord_1/dispute", { method: "POST" }), ctx("ord_1"));

    expect(res.status).toBe(200);
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: { escrowStatus: "disputed" },
    });
    expect(createNotification).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        userId: "seller_1",
        type: "order_escrow_dispute_opened",
        href: `/account/sales/${encodeURIComponent("ord_1")}`,
      }),
    );
    // The body should reference the listing so the seller knows which order is disputed.
    const call = createNotification.mock.calls[0][1] as { body: string };
    expect(call.body).toContain("Vintage Card");
  });

  it("logs the escrow status transition audit entry alongside the notification", async () => {
    await POST(new Request("http://localhost/api/orders/ord_1/dispute", { method: "POST" }), ctx("ord_1"));

    expect(logEscrowStatusTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerId: "seller_1",
        orderId: "ord_1",
        previousStatus: "buyer_paid",
        newStatus: "disputed",
        source: "buyer",
      }),
    );
  });

  it("does not re-notify the seller on a no-op repeat dispute call (already disputed)", async () => {
    prismaMock.order.findFirst.mockResolvedValue({ ...baseOrder, escrowStatus: "disputed" });

    const res = await POST(new Request("http://localhost/api/orders/ord_1/dispute", { method: "POST" }), ctx("ord_1"));

    expect(res.status).toBe(200);
    expect(createNotification).not.toHaveBeenCalled();
    expect(logEscrowStatusTransition).not.toHaveBeenCalled();
  });

  it("rejects disputing a non-escrow order", async () => {
    prismaMock.order.findFirst.mockResolvedValue({ ...baseOrder, paymentMethod: "stripe" });

    const res = await POST(new Request("http://localhost/api/orders/ord_1/dispute", { method: "POST" }), ctx("ord_1"));

    expect(res.status).toBe(404);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("rejects disputing an order whose funds were already released", async () => {
    prismaMock.order.findFirst.mockResolvedValue({ ...baseOrder, escrowStatus: "funds_released" });

    const res = await POST(new Request("http://localhost/api/orders/ord_1/dispute", { method: "POST" }), ctx("ord_1"));

    expect(res.status).toBe(400);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSessionSafe).mockResolvedValue(null as never);

    const res = await POST(new Request("http://localhost/api/orders/ord_1/dispute", { method: "POST" }), ctx("ord_1"));

    expect(res.status).toBe(401);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
