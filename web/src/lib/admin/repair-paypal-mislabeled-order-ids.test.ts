import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  order: { findMany: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { repairPayPalMislabeledStripePaymentIntentIds } from "@/lib/admin/repair-paypal-mislabeled-order-ids";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    stripePaymentIntentId: "21V88625P2888003D",
    processorPaymentId: "21V88625P2888003D",
    ...overrides,
  };
}

describe("repairPayPalMislabeledStripePaymentIntentIds", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only ever queries PayPal/Venmo orders with a non-null stripePaymentIntentId (idempotent / safe to re-run)", async () => {
    prismaMock.order.findMany.mockResolvedValue([]);

    await repairPayPalMislabeledStripePaymentIntentIds();

    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paymentProcessor: "PAYPAL_VENMO", stripePaymentIntentId: { not: null } },
      }),
    );
  });

  it("clears stripePaymentIntentId when processorPaymentId exactly matches the mislabeled value — the historical bug #18 case", async () => {
    prismaMock.order.findMany.mockResolvedValue([order()]);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

    const result = await repairPayPalMislabeledStripePaymentIntentIds();

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order_1",
        paymentProcessor: "PAYPAL_VENMO",
        processorPaymentId: "21V88625P2888003D",
        stripePaymentIntentId: "21V88625P2888003D",
      },
      data: { stripePaymentIntentId: null },
    });
    expect(result.repaired).toEqual(["order_1"]);
    expect(result.skipped).toEqual([]);
    expect(result.candidatesInspected).toBe(1);
  });

  it("never touches a real Stripe order: skips when stripePaymentIntentId is already Stripe-shaped", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      order({ id: "order_2", stripePaymentIntentId: "pi_real_stripe_id", processorPaymentId: "pi_real_stripe_id" }),
    ]);

    const result = await repairPayPalMislabeledStripePaymentIntentIds();

    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(result.repaired).toEqual([]);
    expect(result.skipped).toEqual([
      { orderId: "order_2", reason: expect.stringContaining("Stripe-shaped") },
    ]);
  });

  it("skips (does not clear) when processorPaymentId is missing — cannot verify the match", async () => {
    prismaMock.order.findMany.mockResolvedValue([order({ id: "order_3", processorPaymentId: null })]);

    const result = await repairPayPalMislabeledStripePaymentIntentIds();

    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([
      { orderId: "order_3", reason: expect.stringContaining("missing") },
    ]);
  });

  it("skips (does not clear) when processorPaymentId does not match stripePaymentIntentId", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      order({ id: "order_4", stripePaymentIntentId: "AAAA111", processorPaymentId: "BBBB222" }),
    ]);

    const result = await repairPayPalMislabeledStripePaymentIntentIds();

    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([
      { orderId: "order_4", reason: expect.stringContaining("does not match") },
    ]);
  });

  it("skips gracefully when the row changed between read and write (conditional updateMany matched zero rows)", async () => {
    prismaMock.order.findMany.mockResolvedValue([order({ id: "order_5" })]);
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });

    const result = await repairPayPalMislabeledStripePaymentIntentIds();

    expect(result.repaired).toEqual([]);
    expect(result.skipped).toEqual([
      { orderId: "order_5", reason: expect.stringContaining("changed since it was read") },
    ]);
  });

  it("re-running after a successful repair finds nothing left to do", async () => {
    // After the first run clears stripePaymentIntentId to null, the where-clause filter
    // (`stripePaymentIntentId: { not: null }`) naturally excludes the row from the next run.
    prismaMock.order.findMany.mockResolvedValue([]);

    const result = await repairPayPalMislabeledStripePaymentIntentIds();

    expect(result.candidatesInspected).toBe(0);
    expect(result.repaired).toEqual([]);
  });
});
