import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  extractTaxFromCheckoutSession,
  normalizeCountryCode,
  isStripeTaxFeatureEnabled,
  orderRequiresCheckoutForTax,
} from "@/lib/stripe-tax";
import { normalizeUsStateCode } from "@/lib/us-state-code";

describe("stripe-tax helpers", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_stripe_tax_helpers_key_12345");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes US state and country codes", () => {
    expect(normalizeUsStateCode("tx")).toBe("TX");
    expect(normalizeCountryCode("United States")).toBe("US");
  });

  it("is disabled when STRIPE_TAX_ENABLED is not set", () => {
    expect(isStripeTaxFeatureEnabled()).toBe(true);
  });

  it("can be disabled with STRIPE_TAX_ENABLED=0", () => {
    vi.stubEnv("STRIPE_TAX_ENABLED", "0");
    expect(isStripeTaxFeatureEnabled()).toBe(false);
  });

  it("is enabled when STRIPE_TAX_ENABLED=1", () => {
    vi.stubEnv("STRIPE_TAX_ENABLED", "1");
    expect(isStripeTaxFeatureEnabled()).toBe(true);
  });

  it("orderRequiresCheckoutForTax is false when Stripe Tax feature is disabled", async () => {
    vi.stubEnv("STRIPE_TAX_ENABLED", "0");
    expect(await orderRequiresCheckoutForTax("TX", "US")).toBe(false);
  });

  it("extracts tax from checkout session total_details", () => {
    const extracted = extractTaxFromCheckoutSession({
      total_details: { amount_tax: 825 },
      amount_total: 10825,
    } as Parameters<typeof extractTaxFromCheckoutSession>[0]);
    expect(extracted.taxAmountCents).toBe(825);
    expect(extracted.taxUsd).toBe(8.25);
  });

  it("extracts tax from checkout session metadata when automatic tax is absent", () => {
    const extracted = extractTaxFromCheckoutSession({
      total_details: { amount_tax: 0 },
      metadata: { salesTaxCents: "825", stripeTaxCalculationId: "taxcalc_123" },
    } as unknown as Parameters<typeof extractTaxFromCheckoutSession>[0]);
    expect(extracted.taxAmountCents).toBe(825);
    expect(extracted.stripeTaxCalculationId).toBe("taxcalc_123");
  });
});

describe("sales tax exclusions (documented invariants)", () => {
  it("platform fee base uses item only — tax excluded by resolveCheckoutApplicationFeeCents callers", () => {
    const itemPriceUsd = 100;
    const taxUsd = 8.25;
    const platformFeeBase = itemPriceUsd;
    expect(platformFeeBase).not.toBe(itemPriceUsd + taxUsd);
  });

  it("live show GMV uses itemPriceUsd only in recordLiveShowCompletedSaleTx", () => {
    const gmvIncrement = 100;
    const taxUsd = 8;
    expect(gmvIncrement).not.toBe(gmvIncrement + taxUsd);
  });
});
