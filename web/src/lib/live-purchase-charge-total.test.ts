import { describe, expect, it, vi, beforeEach } from "vitest";

const { orderFindUnique, paymentIntentsRetrieve } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  paymentIntentsRetrieve: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findUnique: orderFindUnique } },
}));

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ paymentIntents: { retrieve: paymentIntentsRetrieve } }),
}));

import { resolveLivePurchaseNotificationChargeUsd } from "./live-purchase-charge-total";

describe("resolveLivePurchaseNotificationChargeUsd", () => {
  beforeEach(() => {
    orderFindUnique.mockReset();
    paymentIntentsRetrieve.mockReset();
  });

  it("prefers succeeded payment intent amount over spot fallback", async () => {
    paymentIntentsRetrieve.mockResolvedValue({ status: "succeeded", amount: 10742 });
    const total = await resolveLivePurchaseNotificationChargeUsd({
      fallbackUsd: 90,
      fulfillmentOrderId: "ord_1",
      stripePaymentIntentId: "pi_1",
    });
    expect(total).toBe(107.42);
    expect(orderFindUnique).not.toHaveBeenCalled();
  });

  it("uses fulfillment order total when PI is unavailable", async () => {
    orderFindUnique.mockResolvedValue({
      totalUsd: 107.42,
      itemPriceUsd: 90,
      shippingPriceUsd: 9.99,
      taxUsd: 7.43,
    });
    const total = await resolveLivePurchaseNotificationChargeUsd({
      fallbackUsd: 90,
      fulfillmentOrderId: "ord_1",
      stripePaymentIntentId: null,
    });
    expect(total).toBe(107.42);
  });

  it("falls back to spot price when no order or PI", async () => {
    const total = await resolveLivePurchaseNotificationChargeUsd({
      fallbackUsd: 90,
      fulfillmentOrderId: null,
      stripePaymentIntentId: null,
    });
    expect(total).toBe(90);
  });
});
