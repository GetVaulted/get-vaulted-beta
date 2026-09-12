import { beforeEach, describe, expect, it, vi } from "vitest";

const createFromCalculationMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "tax_txn_1" }));
const createReversalMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "tax_txn_rev_1" }));
const isStripeConfiguredMock = vi.hoisted(() => vi.fn().mockReturnValue(true));
const orderFindUnique = vi.hoisted(() => vi.fn());
const orderUpdateMany = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 1 }));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    tax: {
      transactions: {
        createFromCalculation: createFromCalculationMock,
        createReversal: createReversalMock,
      },
    },
  }),
  isStripeConfigured: isStripeConfiguredMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: orderFindUnique,
      updateMany: orderUpdateMany,
    },
  },
}));

import { recordStripeTaxTransaction, reverseStripeTaxTransaction } from "@/lib/stripe-tax";

describe("recordStripeTaxTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isStripeConfiguredMock.mockReturnValue(true);
    orderFindUnique.mockResolvedValue({ stripeTaxTransactionId: null });
  });

  it("records a completed sale with idempotency key and persists txn id", async () => {
    const id = await recordStripeTaxTransaction({
      taxCalculationId: "taxcalc_1",
      reference: "ord_1",
      persistToOrderId: "ord_1",
    });

    expect(id).toBe("tax_txn_1");
    expect(createFromCalculationMock).toHaveBeenCalledWith(
      { calculation: "taxcalc_1", reference: "ord_1" },
      { idempotencyKey: "tax_txn_ord_1" },
    );
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "ord_1", stripeTaxTransactionId: null },
      data: { stripeTaxTransactionId: "tax_txn_1" },
    });
  });

  it("skips duplicate when order already has a tax transaction id", async () => {
    orderFindUnique.mockResolvedValueOnce({ stripeTaxTransactionId: "tax_txn_existing" });

    const id = await recordStripeTaxTransaction({
      taxCalculationId: "taxcalc_1",
      reference: "ord_1",
      persistToOrderId: "ord_1",
    });

    expect(id).toBe("tax_txn_existing");
    expect(createFromCalculationMock).not.toHaveBeenCalled();
  });

  it("is a no-op when there is no tax calculation id", async () => {
    await recordStripeTaxTransaction({ taxCalculationId: null, reference: "ord_1" });
    expect(createFromCalculationMock).not.toHaveBeenCalled();
  });

  it("never throws — a failure here must not block payment finalization", async () => {
    createFromCalculationMock.mockRejectedValueOnce(new Error("stripe down"));
    await expect(
      recordStripeTaxTransaction({ taxCalculationId: "taxcalc_1", reference: "ord_1" }),
    ).resolves.toBeNull();
  });
});

describe("reverseStripeTaxTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isStripeConfiguredMock.mockReturnValue(true);
  });

  it("creates a full reversal when remaining tax equals original", async () => {
    orderFindUnique.mockResolvedValue({
      stripeTaxTransactionId: "tax_txn_1",
      stripeTaxTransactionReversalId: null,
      taxAmountCents: 825,
      taxRefundedCents: 0,
    });

    const id = await reverseStripeTaxTransaction({
      orderId: "ord_1",
      reverseAmountCents: 825,
      reason: "refund",
    });

    expect(id).toBe("tax_txn_rev_1");
    expect(createReversalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        original_transaction: "tax_txn_1",
        mode: "full",
      }),
      { idempotencyKey: "tax_rev_ord_1_825" },
    );
  });

  it("skips duplicate reversal when already stored", async () => {
    orderFindUnique.mockResolvedValue({
      stripeTaxTransactionId: "tax_txn_1",
      stripeTaxTransactionReversalId: "tax_txn_rev_existing",
      taxAmountCents: 825,
      taxRefundedCents: 825,
    });

    const id = await reverseStripeTaxTransaction({ orderId: "ord_1" });
    expect(id).toBe("tax_txn_rev_existing");
    expect(createReversalMock).not.toHaveBeenCalled();
  });
});
