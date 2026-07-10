import { beforeEach, describe, expect, it, vi } from "vitest";

const createReversal = vi.hoisted(() => vi.fn());
const retrievePi = vi.hoisted(() => vi.fn());
const reportUrgentPaymentAnomaly = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    paymentIntents: { retrieve: retrievePi },
    transfers: { createReversal },
  }),
}));
vi.mock("@/lib/cron-anomaly-alert", () => ({ reportUrgentPaymentAnomaly }));

import {
  chargeSellerForLabelCost,
  markOrderLabelCostReversalFailed,
} from "@/services/shipping/charge-seller-label-cost";

describe("chargeSellerForLabelCost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      sellerId: "seller_1",
      stripePaymentIntentId: "pi_1",
      stripeTransferId: null,
      shippoTransactionId: "shippo_tx_1",
      shippingLabelCostReversalId: null,
      shippingLabelCostChargedShippoTransactionId: null,
      shippingLabelCostReversedCents: 0,
      paymentProcessor: "STRIPE",
    });
    retrievePi.mockResolvedValue({
      latest_charge: { transfer: { id: "tr_1" } },
    });
    createReversal.mockResolvedValue({ id: "trr_1" });
  });

  it("reverses label cost from the destination-charge transfer", async () => {
    const result = await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 548,
      shippoTransactionId: "shippo_tx_1",
    });

    expect(result).toEqual({
      ok: true,
      reversedCents: 548,
      reversalId: "trr_1",
      skipped: false,
    });
    expect(createReversal).toHaveBeenCalledWith(
      "tr_1",
      expect.objectContaining({ amount: 548 }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining("label_cost_ord_1_shippo_tx_1") }),
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: expect.objectContaining({
        stripeTransferId: "tr_1",
        shippingLabelCostReversalId: "trr_1",
        shippingLabelCostChargedShippoTransactionId: "shippo_tx_1",
        shippingLabelCostReversedCents: 548,
      }),
    });
  });

  it("skips when the same Shippo transaction was already charged", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      sellerId: "seller_1",
      stripePaymentIntentId: "pi_1",
      stripeTransferId: "tr_1",
      shippoTransactionId: "shippo_tx_1",
      shippingLabelCostReversalId: "trr_1",
      shippingLabelCostChargedShippoTransactionId: "shippo_tx_1",
      shippingLabelCostReversedCents: 548,
      paymentProcessor: "STRIPE",
    });

    const result = await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 548,
      shippoTransactionId: "shippo_tx_1",
    });

    expect(result).toMatchObject({ ok: true, skipped: true, reversalId: "trr_1" });
    expect(createReversal).not.toHaveBeenCalled();
  });

  it("charges again when Shippo transaction changes (regenerate)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      sellerId: "seller_1",
      stripePaymentIntentId: "pi_1",
      stripeTransferId: "tr_1",
      shippoTransactionId: "shippo_tx_2",
      shippingLabelCostReversalId: "trr_1",
      shippingLabelCostChargedShippoTransactionId: "shippo_tx_1",
      shippingLabelCostReversedCents: 548,
      paymentProcessor: "STRIPE",
    });
    createReversal.mockResolvedValue({ id: "trr_2" });

    const result = await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 600,
      shippoTransactionId: "shippo_tx_2",
    });

    expect(result).toEqual({
      ok: true,
      reversedCents: 1148,
      reversalId: "trr_2",
      skipped: false,
    });
    expect(createReversal).toHaveBeenCalled();
  });

  it("marks fulfillment exception when reversal fails after label purchase", async () => {
    createReversal.mockRejectedValue(new Error("insufficient funds"));
    const result = await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 548,
      shippoTransactionId: "shippo_tx_1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REVERSAL_FAILED");
    expect(reportUrgentPaymentAnomaly).toHaveBeenCalled();

    await markOrderLabelCostReversalFailed("ord_1");
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: {
        fulfillmentStatus: "exception",
        shippingStatus: "label_cost_reversal_failed",
      },
    });
  });
});
