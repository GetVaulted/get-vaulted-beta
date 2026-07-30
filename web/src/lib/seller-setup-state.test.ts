import { describe, expect, it } from "vitest";
import {
  isPayoutSetupComplete,
  isPayoutSetupSubmitted,
  isRequiredSellerSetupComplete,
} from "@/lib/seller-setup-state";

describe("seller-setup-state payout rails", () => {
  it("treats verified PayPal as payout submitted without Stripe", () => {
    const checks = {
      hasStripeAccount: false,
      stripeChargesEnabled: false,
      stripePayoutSubmitted: false,
      hasShipFromAddress: true,
      paypalPayoutReady: true,
      preferredSellerPayoutProcessor: "PAYPAL" as const,
    };
    expect(isPayoutSetupSubmitted(checks)).toBe(true);
    expect(isPayoutSetupComplete(checks)).toBe(true);
    expect(isRequiredSellerSetupComplete(checks)).toBe(true);
  });

  it("still requires Stripe when PayPal is not ready", () => {
    const checks = {
      hasStripeAccount: false,
      stripeChargesEnabled: false,
      stripePayoutSubmitted: false,
      hasShipFromAddress: true,
      paypalPayoutReady: false,
      preferredSellerPayoutProcessor: "PAYPAL" as const,
    };
    expect(isPayoutSetupSubmitted(checks)).toBe(false);
    expect(isRequiredSellerSetupComplete(checks)).toBe(false);
  });

  it("keeps Stripe path for Connect sellers", () => {
    const checks = {
      hasStripeAccount: true,
      stripeChargesEnabled: false,
      stripePayoutSubmitted: true,
      hasShipFromAddress: true,
      paypalPayoutReady: false,
      preferredSellerPayoutProcessor: "STRIPE" as const,
    };
    expect(isPayoutSetupSubmitted(checks)).toBe(true);
    expect(isPayoutSetupComplete(checks)).toBe(false);
    expect(isRequiredSellerSetupComplete(checks)).toBe(true);
  });

  it("does not treat Stripe as done when seller switched to PayPal without verifying email", () => {
    const checks = {
      hasStripeAccount: true,
      stripeChargesEnabled: true,
      stripePayoutSubmitted: true,
      hasShipFromAddress: true,
      paypalPayoutReady: false,
      preferredSellerPayoutProcessor: "PAYPAL" as const,
    };
    expect(isPayoutSetupSubmitted(checks)).toBe(false);
    expect(isPayoutSetupComplete(checks)).toBe(false);
    expect(isRequiredSellerSetupComplete(checks)).toBe(false);
  });
});
