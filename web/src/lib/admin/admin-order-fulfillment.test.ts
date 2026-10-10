import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), update: vi.fn() },
  adminActionLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const events = vi.hoisted(() => ({
  processSellerMarkedShippedPayoutEvaluation: vi.fn(),
  processStandardDeliveryPayoutEvaluation: vi.fn(),
}));
vi.mock("@/services/payout/process-payout-tier-events", () => events);

import { adminFixOrderFulfillment } from "./admin-order-fulfillment";

const order = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  sellerId: "s1",
  paymentStatus: "paid",
  paymentMethod: "stripe",
  status: "paid",
  fulfillmentStatus: "pending",
  shippedAt: null,
  deliveryConfirmedAt: null,
  carrier: null,
  trackingNumber: null,
  ...over,
});
const base = { adminUserId: "a", orderId: "o1", reason: "seller forgot to press shipped" };

describe("adminFixOrderFulfillment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses unpaid and escrow orders", async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce(order({ paymentStatus: "pending" }));
    await expect(adminFixOrderFulfillment({ ...base, action: "mark_shipped" })).rejects.toMatchObject({ code: "ORDER_NOT_PAID" });
    prismaMock.order.findUnique.mockResolvedValueOnce(order({ paymentMethod: "escrow" }));
    await expect(adminFixOrderFulfillment({ ...base, action: "mark_shipped" })).rejects.toMatchObject({ code: "ESCROW_USE_ESCROW_FLOW" });
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("mark_shipped sets shipped state, logs, and re-runs payout rules", async () => {
    prismaMock.order.findUnique.mockResolvedValue(order());
    await adminFixOrderFulfillment({ ...base, action: "mark_shipped", carrier: "USPS", trackingNumber: "9400" });
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: expect.objectContaining({ status: "shipped", fulfillmentStatus: "shipped", trackingNumber: "9400", carrier: "USPS" }),
    });
    expect(events.processSellerMarkedShippedPayoutEvaluation).toHaveBeenCalledWith("o1");
    expect(prismaMock.adminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "order.mark_shipped", targetUserId: "s1" }) }),
    );
  });

  it("will not mark shipped twice or deliver twice", async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce(order({ fulfillmentStatus: "shipped" }));
    await expect(adminFixOrderFulfillment({ ...base, action: "mark_shipped" })).rejects.toMatchObject({ code: "ALREADY_SHIPPED" });
    prismaMock.order.findUnique.mockResolvedValueOnce(order({ fulfillmentStatus: "delivered" }));
    await expect(adminFixOrderFulfillment({ ...base, action: "mark_delivered" })).rejects.toMatchObject({ code: "ALREADY_DELIVERED" });
  });

  it("set_tracking needs a number and does not touch payout", async () => {
    prismaMock.order.findUnique.mockResolvedValue(order());
    await expect(adminFixOrderFulfillment({ ...base, action: "set_tracking" })).rejects.toMatchObject({ code: "TRACKING_REQUIRED" });
    await adminFixOrderFulfillment({ ...base, action: "set_tracking", trackingNumber: "1Z999" });
    expect(events.processSellerMarkedShippedPayoutEvaluation).not.toHaveBeenCalled();
    expect(events.processStandardDeliveryPayoutEvaluation).not.toHaveBeenCalled();
  });

  it("a failure in payout evaluation does not undo the fix", async () => {
    prismaMock.order.findUnique.mockResolvedValue(order({ fulfillmentStatus: "shipped" }));
    events.processStandardDeliveryPayoutEvaluation.mockRejectedValueOnce(new Error("boom"));
    await expect(adminFixOrderFulfillment({ ...base, action: "mark_delivered" })).resolves.toEqual({ ok: true });
  });
});
