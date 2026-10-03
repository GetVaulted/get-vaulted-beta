import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  order: { findMany: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const persistOrderStripeChargeLedgerMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stripe-charge-ledger", () => ({
  persistOrderStripeChargeLedger: persistOrderStripeChargeLedgerMock,
}));

import { backfillOrderPaidAtBatch } from "@/lib/admin/backfill-order-paid-at";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    stripePaymentIntentId: "pi_1",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("backfillOrderPaidAtBatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports no work and does not touch anything when nothing is missing paidAt", async () => {
    prismaMock.order.findMany.mockResolvedValue([]);

    const result = await backfillOrderPaidAtBatch();

    expect(result).toEqual({
      candidatesInBatch: 0,
      stripeAuthoritative: 0,
      createdAtFallback: 0,
      failed: 0,
      mayHaveMore: false,
    });
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("only ever queries orders where paidAt is null (idempotent / safe to re-run)", async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    await backfillOrderPaidAtBatch();
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ paidAt: null }),
      }),
    );
  });

  it("counts as stripe_authoritative ONLY when the ledger call actually recovered a real charge", async () => {
    prismaMock.order.findMany.mockResolvedValue([order()]);
    persistOrderStripeChargeLedgerMock.mockResolvedValue({ paidAt: new Date("2026-07-01T12:00:00.000Z") });

    const result = await backfillOrderPaidAtBatch();

    expect(persistOrderStripeChargeLedgerMock).toHaveBeenCalledWith({
      orderId: "order_1",
      paymentIntentId: "pi_1",
      force: false,
    });
    expect(result.stripeAuthoritative).toBe(1);
    expect(result.createdAtFallback).toBe(0);
    // persistOrderStripeChargeLedger itself writes paidAt + paidAtSource when it succeeds — no
    // separate update call here.
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("counts as created_at_fallback (never stripe_authoritative) when the Stripe call resolves but yields no charge", async () => {
    prismaMock.order.findMany.mockResolvedValue([order({ id: "order_2" })]);
    // Resolves successfully (no throw) but with no usable charge — this must NOT be counted as an
    // upgrade just because the promise settled without rejecting.
    persistOrderStripeChargeLedgerMock.mockResolvedValue(null);

    const result = await backfillOrderPaidAtBatch();

    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: "order_2", paidAt: null },
      data: { paidAt: order().createdAt, paidAtSource: "created_at_fallback" },
    });
    expect(result.stripeAuthoritative).toBe(0);
    expect(result.createdAtFallback).toBe(1);
  });

  it("falls back to createdAt immediately for orders with no PaymentIntent at all (giveaway/$0 orders)", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      order({ id: "order_3", stripePaymentIntentId: null }),
    ]);

    const result = await backfillOrderPaidAtBatch();

    expect(persistOrderStripeChargeLedgerMock).not.toHaveBeenCalled();
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: "order_3", paidAt: null },
      data: { paidAt: order().createdAt, paidAtSource: "created_at_fallback" },
    });
    expect(result.createdAtFallback).toBe(1);
    expect(result.stripeAuthoritative).toBe(0);
  });

  it("counts a thrown error as failed, not as a silent fallback", async () => {
    prismaMock.order.findMany.mockResolvedValue([order({ id: "order_4" })]);
    persistOrderStripeChargeLedgerMock.mockRejectedValue(new Error("stripe timeout"));

    const result = await backfillOrderPaidAtBatch();

    expect(result.failed).toBe(1);
    expect(result.stripeAuthoritative).toBe(0);
    expect(result.createdAtFallback).toBe(0);
  });

  it("signals mayHaveMore when the batch came back full", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => order({ id: `order_${i}`, stripePaymentIntentId: null }));
    prismaMock.order.findMany.mockResolvedValue(rows);

    const result = await backfillOrderPaidAtBatch({ limit: 3 });

    expect(result.mayHaveMore).toBe(true);
  });
});
