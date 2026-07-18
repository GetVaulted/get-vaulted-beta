import { beforeEach, describe, expect, it, vi } from "vitest";

const createCalcMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: "taxcalc_1",
    tax_amount_exclusive: 825,
    tax_breakdown: [{ amount: 825 }],
    shipping_cost: null,
  }),
);

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ tax: { calculations: { create: createCalcMock } } }),
  isStripeConfigured: () => true,
}));

vi.mock("@/lib/sales-tax-jurisdiction", () => ({
  isMarketplaceSaleTaxEligible: vi.fn().mockResolvedValue(true),
  resolveTaxCollectionForDestination: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    taxNexusState: { findMany: vi.fn(), upsert: vi.fn() },
  },
}));

import {
  estimateSalesTaxCents,
  resetTaxCalculationCacheForTests,
  taxCalculationFingerprint,
} from "@/lib/stripe-tax";

const shipTo = {
  shipRecipientName: "Buyer",
  shipAddress: "1 Main St",
  shipCity: "Austin",
  shipState: "TX",
  shipZip: "78701",
  shipCountry: "US",
};

describe("tax calculation fingerprint cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTaxCalculationCacheForTests();
  });

  it("reuses identical calculations instead of calling Stripe twice", async () => {
    const a = await estimateSalesTaxCents({
      itemPriceUsd: 100,
      shippingPriceUsd: 10,
      shipTo,
    });
    const b = await estimateSalesTaxCents({
      itemPriceUsd: 100,
      shippingPriceUsd: 10,
      shipTo,
    });
    expect(a.taxCalculationId).toBe("taxcalc_1");
    expect(b.taxCalculationId).toBe("taxcalc_1");
    expect(createCalcMock).toHaveBeenCalledTimes(1);
  });

  it("creates a new calculation when the fingerprint changes", async () => {
    await estimateSalesTaxCents({ itemPriceUsd: 100, shippingPriceUsd: 10, shipTo });
    await estimateSalesTaxCents({ itemPriceUsd: 120, shippingPriceUsd: 10, shipTo });
    expect(createCalcMock).toHaveBeenCalledTimes(2);
  });

  it("fingerprint is stable for the same address and amounts", () => {
    const f1 = taxCalculationFingerprint({
      itemCents: 10000,
      shippingCents: 1000,
      shipTo,
    });
    const f2 = taxCalculationFingerprint({
      itemCents: 10000,
      shippingCents: 1000,
      shipTo,
    });
    expect(f1).toBe(f2);
  });
});
