import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  orderFindUnique,
  orderFindMany,
  variantFindMany,
  variantFindUnique,
  spotFindMany,
  spotFindUnique,
  paymentIntentsRetrieve,
} = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderFindMany: vi.fn(),
  variantFindMany: vi.fn(),
  variantFindUnique: vi.fn(),
  spotFindMany: vi.fn(),
  spotFindUnique: vi.fn(),
  paymentIntentsRetrieve: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findUnique: orderFindUnique, findMany: orderFindMany },
    liveItemVariantPurchase: { findMany: variantFindMany, findUnique: variantFindUnique },
    breakSpot: { findMany: spotFindMany, findUnique: spotFindUnique },
  },
}));

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ paymentIntents: { retrieve: paymentIntentsRetrieve } }),
}));

import {
  enrichPaymentFailureChargeAmounts,
  orderChargeUsdFromFields,
  resolveChargeUsdFromFulfillmentOrderMap,
  resolveLivePaymentFailureChargeUsd,
  resolveLivePurchaseNotificationChargeUsd,
} from "./live-purchase-charge-total";

describe("orderChargeUsdFromFields", () => {
  it("uses order total when present", () => {
    expect(
      orderChargeUsdFromFields({
        totalUsd: 107.42,
        itemPriceUsd: 90,
        shippingPriceUsd: 9.99,
        taxUsd: 7.43,
      }),
    ).toBe(107.42);
  });

  it("computes from parts when total is spot-only", () => {
    expect(
      orderChargeUsdFromFields({
        totalUsd: 90,
        itemPriceUsd: 90,
        shippingPriceUsd: 9.99,
        taxUsd: 7.43,
      }),
    ).toBe(107.42);
  });

  it("computes from parts when total is zero", () => {
    expect(
      orderChargeUsdFromFields({
        totalUsd: 0,
        itemPriceUsd: 90,
        shippingPriceUsd: 9.99,
        taxUsd: 7.43,
      }),
    ).toBe(107.42);
  });
});

describe("resolveChargeUsdFromFulfillmentOrderMap", () => {
  it("returns fulfillment order charge instead of spot fallback", () => {
    const charge = resolveChargeUsdFromFulfillmentOrderMap(90, "ord_1", new Map([["ord_1", 107.42]]));
    expect(charge).toBe(107.42);
  });
});

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

  it("sums item shipping and tax when order totalUsd is spot-only", async () => {
    orderFindUnique.mockResolvedValue({
      totalUsd: 90,
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

describe("resolveLivePaymentFailureChargeUsd", () => {
  beforeEach(() => {
    orderFindMany.mockReset();
    variantFindUnique.mockReset();
    spotFindUnique.mockReset();
  });

  it("uses full order charge over item-only fallback", async () => {
    orderFindMany.mockResolvedValue([
      {
        id: "ord_1",
        totalUsd: 7.57,
        itemPriceUsd: 3,
        shippingPriceUsd: 3.99,
        taxUsd: 0.58,
      },
    ]);
    const total = await resolveLivePaymentFailureChargeUsd({
      fallbackUsd: 3,
      orderId: "ord_1",
    });
    expect(total).toBe(7.57);
  });

  it("falls back when no linked commerce ids", async () => {
    const total = await resolveLivePaymentFailureChargeUsd({
      fallbackUsd: 3,
    });
    expect(total).toBe(3);
  });
});

describe("enrichPaymentFailureChargeAmounts", () => {
  beforeEach(() => {
    orderFindMany.mockReset();
    variantFindMany.mockReset();
    spotFindMany.mockReset();
  });

  it("aligns failure amount with recent-sales order charge", async () => {
    orderFindMany.mockResolvedValue([
      {
        id: "ord_1",
        totalUsd: 7.57,
        itemPriceUsd: 3,
        shippingPriceUsd: 3.99,
        taxUsd: 0.58,
      },
    ]);
    variantFindMany.mockResolvedValue([]);
    spotFindMany.mockResolvedValue([]);
    const [row] = await enrichPaymentFailureChargeAmounts([
      {
        id: "fail_1",
        amountUsd: 3,
        orderId: "ord_1",
        variantPurchaseId: null,
        breakSpotId: null,
      },
    ]);
    expect(row?.amountUsd).toBe(7.57);
  });
});
