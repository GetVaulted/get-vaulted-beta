import { beforeEach, describe, expect, it, vi } from "vitest";

const createTransfer = vi.hoisted(() => vi.fn());
const retrieveBalance = vi.hoisted(() => vi.fn());

const finance = vi.hoisted(() => ({
  row: null as any,
}));

const prismaMock = vi.hoisted(() => ({
  shipmentLabelFinance: {
    findUnique: vi.fn(async () => finance.row),
    update: vi.fn(async ({ data }: any) => {
      Object.assign(finance.row, data);
      return finance.row;
    }),
    findMany: vi.fn(async () => (finance.row ? [finance.row] : [])),
  },
  order: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    transfers: { create: createTransfer },
    balance: { retrieve: retrieveBalance },
  }),
}));

import { creditSellerForLabelCost } from "@/services/shipping/credit-seller-label-cost";

describe("creditSellerForLabelCost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    finance.row = {
      id: "lf_1",
      orderId: "ord_1",
      shippoTransactionId: "tx_1",
      labelCostCents: 1751,
      status: "refunded",
      sellerClawbackCents: 1751,
      sellerClawbackReversalId: "trr_1",
      sellerCreditCents: 0,
      sellerCreditTransferId: null,
      creditIdempotencyKey: null,
    };
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      sellerId: "seller_1",
      stripePaymentIntentId: "pi_1",
      paymentProcessor: "STRIPE",
      seller: { stripeAccountId: "acct_seller" },
    });
    createTransfer.mockResolvedValue({ id: "tr_credit_1", amount: 1751 });
    retrieveBalance.mockResolvedValue({ available: [{ currency: "usd", amount: 100_000 }] });
  });

  it("credits seller once via Connect transfer", async () => {
    const result = await creditSellerForLabelCost({
      orderId: "ord_1",
      shippoTransactionId: "tx_1",
      creditCents: 1751,
    });
    expect(result).toEqual({
      ok: true,
      creditCents: 1751,
      transferId: "tr_credit_1",
      skipped: false,
    });
    expect(createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1751,
        destination: "acct_seller",
        metadata: expect.objectContaining({
          reason: "replaced_label_refund_credit",
          shipmentLabelFinanceId: "lf_1",
          originalReversalId: "trr_1",
        }),
      }),
      expect.objectContaining({
        idempotencyKey: "label_credit_ord_1_tx_1_1751",
      }),
    );
  });

  it("does not mark credit successful when platform balance is insufficient", async () => {
    retrieveBalance.mockResolvedValue({ available: [{ currency: "usd", amount: 100 }] });
    const result = await creditSellerForLabelCost({
      orderId: "ord_1",
      shippoTransactionId: "tx_1",
      creditCents: 1751,
    });
    expect(result).toMatchObject({ ok: false, code: "INSUFFICIENT_PLATFORM_BALANCE" });
    expect(createTransfer).not.toHaveBeenCalled();
    expect(finance.row.sellerCreditTransferId).toBeNull();
  });

  it("credit retry cannot double-credit", async () => {
    finance.row.sellerCreditCents = 1751;
    finance.row.sellerCreditTransferId = "tr_credit_1";
    const result = await creditSellerForLabelCost({
      orderId: "ord_1",
      shippoTransactionId: "tx_1",
      creditCents: 1751,
    });
    expect(result).toMatchObject({ ok: true, skipped: true, transferId: "tr_credit_1" });
    expect(createTransfer).not.toHaveBeenCalled();
  });
});
