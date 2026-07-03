import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/seller-commerce-event", () => ({
  SELLER_COMMERCE_KIND: { orderRefunded: "order_refunded" },
  logSellerCommerceEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/marketplace/ecosystem-sync", () => ({ emitOrderLifecycleSync: vi.fn() }));
vi.mock("@/services/shipping/live-shipping-pricing", () => ({
  removeOrderFromLiveShippingSessionOnRefundTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/payments", () => ({ PAYMENT_REFUNDED: "refunded" }));

const stripeRefundsCreate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: vi.fn().mockReturnValue(true),
  getStripe: () => ({ refunds: { create: stripeRefundsCreate } }),
}));

const prismaMock = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
  orderRefundRequest: {
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn(),
  },
  listing: {
    updateMany: vi.fn().mockResolvedValue(undefined),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { executeOrderRefund } from "@/services/order-refund-request";

describe("executeOrderRefund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock));
    prismaMock.orderRefundRequest.updateMany.mockResolvedValue({ count: 1 });
  });

  it("issues a Stripe refund with reverse_transfer: true so the seller's transferred share is clawed back", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      listingId: "lst_1",
      paymentStatus: "paid",
      paymentMethod: "stripe",
      stripePaymentIntentId: "pi_123",
      itemPriceUsd: 100,
      shippingPriceUsd: 10,
      taxAmountCents: 800,
      listing: { title: "Test Card" },
    });
    stripeRefundsCreate.mockResolvedValue({ id: "re_123" });

    await executeOrderRefund("ord_1", "req_1");

    expect(stripeRefundsCreate).toHaveBeenCalledTimes(1);
    const call = stripeRefundsCreate.mock.calls[0][0];
    expect(call.reverse_transfer).toBe(true);
    // Full refund = item + shipping + tax, in cents.
    expect(call.amount).toBe(100 * 100 + 10 * 100 + 800);
    expect(call.payment_intent).toBe("pi_123");
  });

  it("blocks seller payout and records tax reversal atomically with the refund status", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_2",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      listingId: "lst_1",
      paymentStatus: "paid",
      paymentMethod: "stripe",
      stripePaymentIntentId: "pi_456",
      itemPriceUsd: 50,
      shippingPriceUsd: 0,
      taxAmountCents: 0,
      listing: { title: "Another Card" },
    });
    stripeRefundsCreate.mockResolvedValue({ id: "re_456" });

    await executeOrderRefund("ord_2", "req_2");

    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_2" },
        data: expect.objectContaining({
          paymentStatus: "refunded",
          status: "cancelled",
          payoutStatus: "blocked",
          payoutBlockedReason: "refunded",
          taxRefundedCents: 0,
        }),
      }),
    );
  });

  it("is idempotent: does nothing further when the order is already refunded", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_3",
      paymentStatus: "refunded",
    });

    await executeOrderRefund("ord_3", "req_3");

    expect(stripeRefundsCreate).not.toHaveBeenCalled();
    expect(prismaMock.orderRefundRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "req_3", status: { not: "refunded" } } }),
    );
  });

  it("rejects escrow-paid orders (Stripe refund path does not support escrow)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_4",
      paymentStatus: "paid",
      paymentMethod: "escrow",
    });

    await expect(executeOrderRefund("ord_4", "req_4")).rejects.toMatchObject({ code: "ESCROW_NOT_SUPPORTED" });
    expect(stripeRefundsCreate).not.toHaveBeenCalled();
  });

  it("rejects layaway-paid orders (a single-PI refund would only reverse the last installment, not the whole order)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_5",
      paymentStatus: "paid",
      paymentMethod: "layaway",
      stripePaymentIntentId: "pi_last_installment",
    });

    await expect(executeOrderRefund("ord_5", "req_5")).rejects.toMatchObject({ code: "LAYAWAY_NOT_SUPPORTED" });
    expect(stripeRefundsCreate).not.toHaveBeenCalled();
  });
});
