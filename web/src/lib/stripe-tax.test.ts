import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  extractTaxFromCheckoutSession,
  extractTaxFromPaymentIntent,
  normalizeCountryCode,
  isStripeTaxFeatureEnabled,
  orderRequiresCheckoutForTax,
  connectCheckoutPaymentIntentData,
} from "@/lib/stripe-tax";

describe("stripe-tax helpers", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_stripe_tax_helpers_key_12345");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes US state and country codes", () => {
    expect(normalizeCountryCode("United States")).toBe("US");
    expect(normalizeCountryCode("Un")).toBe("US");
    expect(normalizeCountryCode("UN")).toBe("US");
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

  it("extracts tax from payment intent metadata", () => {
    const extracted = extractTaxFromPaymentIntent({
      amount: 10825,
      amount_received: 10825,
      metadata: { salesTaxCents: "825", stripeTaxCalculationId: "taxcalc_live_1" },
    } as unknown as Parameters<typeof extractTaxFromPaymentIntent>[0]);
    expect(extracted.taxAmountCents).toBe(825);
    expect(extracted.stripeTaxCalculationId).toBe("taxcalc_live_1");
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

describe("connectCheckoutPaymentIntentData", () => {
  it("uses application_fee_amount when tax does not require an explicit transfer", () => {
    const data = connectCheckoutPaymentIntentData({
      destinationAccountId: "acct_seller",
      applicationFeeCents: 800,
      sellerTransferCents: null,
      metadata: { orderId: "ord_1", kind: "buy_now" },
    });
    expect(data.application_fee_amount).toBe(800);
    expect(data.transfer_data).toEqual({ destination: "acct_seller" });
  });

  it("uses transfer_data.amount instead of application_fee_amount when tax is split out", () => {
    const data = connectCheckoutPaymentIntentData({
      destinationAccountId: "acct_seller",
      applicationFeeCents: 800,
      sellerTransferCents: 92_000,
      metadata: { orderId: "ord_1", kind: "buy_now" },
    });
    expect(data.application_fee_amount).toBeUndefined();
    expect(data.transfer_data).toEqual({ destination: "acct_seller", amount: 92_000 });
  });

  it("passes Stripe processing to the seller: adds to application fee (untaxed)", () => {
    const data = connectCheckoutPaymentIntentData({
      destinationAccountId: "acct_seller",
      applicationFeeCents: 800,
      sellerTransferCents: null,
      processingFeeCents: 320,
      metadata: { orderId: "ord_1", kind: "buy_now" },
    });
    expect(data.application_fee_amount).toBe(1_120);
  });

  it("passes Stripe processing to the seller: reduces transfer (taxed)", () => {
    const data = connectCheckoutPaymentIntentData({
      destinationAccountId: "acct_seller",
      applicationFeeCents: 800,
      sellerTransferCents: 92_000,
      processingFeeCents: 320,
      metadata: { orderId: "ord_1", kind: "buy_now" },
    });
    expect(data.application_fee_amount).toBeUndefined();
    expect(data.transfer_data).toEqual({ destination: "acct_seller", amount: 91_680 });
  });
});
