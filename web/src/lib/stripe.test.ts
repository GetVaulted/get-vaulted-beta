import { afterEach, describe, expect, it, vi } from "vitest";
import { isStripeConfigured, marketplaceApplicationFeeCents, platformFeeCentsFromSubtotalUsd } from "@/lib/stripe";

describe("isStripeConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when STRIPE_SECRET_KEY is set and long enough", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_12345678901");
    expect(isStripeConfigured()).toBe(true);
  });

  it("returns false when STRIPE_SECRET_KEY is missing", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(isStripeConfigured()).toBe(false);
  });

  it("returns false when STRIPE_SECRET_KEY is too short (invalid placeholder)", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_1");
    expect(isStripeConfigured()).toBe(false);
  });
});

describe("marketplaceApplicationFeeCents", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses fixed 8% for normal (non-company) listings", () => {
    const subtotal = 100;
    expect(marketplaceApplicationFeeCents(subtotal, false)).toBe(platformFeeCentsFromSubtotalUsd(subtotal));
    expect(marketplaceApplicationFeeCents(subtotal, false)).toBe(800);
  });

  it("returns 0 for company / merch listings regardless of percent", () => {
    expect(platformFeeCentsFromSubtotalUsd(100)).toBeGreaterThan(0);
    expect(marketplaceApplicationFeeCents(100, true)).toBe(0);
    expect(marketplaceApplicationFeeCents(9999, true)).toBe(0);
  });
});
