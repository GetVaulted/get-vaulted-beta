import { describe, expect, it } from "vitest";
import { isStripePaymentIntentId, sanitizeStripePaymentIntentId } from "@/lib/stripe-payment-intent-id";

describe("isStripePaymentIntentId", () => {
  it("accepts real Stripe PaymentIntent ids", () => {
    expect(isStripePaymentIntentId("pi_3U2kAVRpBjIH1YA105xDPdno")).toBe(true);
  });

  it("rejects PayPal/Venmo capture ids (the bug #18 shape)", () => {
    expect(isStripePaymentIntentId("21V88625P2888003D")).toBe(false);
    expect(isStripePaymentIntentId("5XJ664540F404802H")).toBe(false);
  });

  it("rejects null, undefined, empty, and non-pi_ strings", () => {
    expect(isStripePaymentIntentId(null)).toBe(false);
    expect(isStripePaymentIntentId(undefined)).toBe(false);
    expect(isStripePaymentIntentId("")).toBe(false);
    expect(isStripePaymentIntentId("re_123")).toBe(false);
    expect(isStripePaymentIntentId("pm_123")).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isStripePaymentIntentId("  pi_abc123  ")).toBe(true);
  });
});

describe("sanitizeStripePaymentIntentId", () => {
  it("passes real Stripe ids through (trimmed)", () => {
    expect(sanitizeStripePaymentIntentId(" pi_abc123 ")).toBe("pi_abc123");
  });

  it("narrows a PayPal/Venmo id to null instead of ever returning it", () => {
    expect(sanitizeStripePaymentIntentId("21V88625P2888003D")).toBeNull();
  });

  it("narrows null/undefined/empty to null", () => {
    expect(sanitizeStripePaymentIntentId(null)).toBeNull();
    expect(sanitizeStripePaymentIntentId(undefined)).toBeNull();
    expect(sanitizeStripePaymentIntentId("")).toBeNull();
  });
});
