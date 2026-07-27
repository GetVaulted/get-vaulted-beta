import { describe, expect, it } from "vitest";
import {
  effectiveSellerPayoutProcessor,
  isSellerPayoutRailReady,
  normalizePayPalPayoutEmail,
  sellerUsesPayPalPayout,
} from "@/lib/seller-payout-rail";

describe("seller-payout-rail", () => {
  it("defaults effective processor to STRIPE when PayPal flag is off", () => {
    const prev = process.env.PAYPAL_SELLER_PAYOUTS_ENABLED;
    process.env.PAYPAL_SELLER_PAYOUTS_ENABLED = "false";
    expect(
      effectiveSellerPayoutProcessor({ preferredSellerPayoutProcessor: "PAYPAL" }),
    ).toBe("STRIPE");
    process.env.PAYPAL_SELLER_PAYOUTS_ENABLED = prev;
  });

  it("enables PayPal rail when credentials exist even without explicit flag", async () => {
    const prev = process.env.PAYPAL_SELLER_PAYOUTS_ENABLED;
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    delete process.env.PAYPAL_SELLER_PAYOUTS_ENABLED;
    process.env.PAYPAL_CLIENT_ID = "id";
    process.env.PAYPAL_CLIENT_SECRET = "secret";
    const { isPayPalSellerPayoutsEnabled } = await import("@/lib/paypal");
    expect(isPayPalSellerPayoutsEnabled()).toBe(true);
    expect(
      effectiveSellerPayoutProcessor({ preferredSellerPayoutProcessor: "PAYPAL" }),
    ).toBe("PAYPAL");
    process.env.PAYPAL_SELLER_PAYOUTS_ENABLED = prev;
    process.env.PAYPAL_CLIENT_ID = id;
    process.env.PAYPAL_CLIENT_SECRET = secret;
  });

  it("treats PayPal preference as ready only with verified email", () => {
    const prev = process.env.PAYPAL_SELLER_PAYOUTS_ENABLED;
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    process.env.PAYPAL_SELLER_PAYOUTS_ENABLED = "true";
    process.env.PAYPAL_CLIENT_ID = "id";
    process.env.PAYPAL_CLIENT_SECRET = "secret";

    expect(
      sellerUsesPayPalPayout({ preferredSellerPayoutProcessor: "PAYPAL" }),
    ).toBe(true);
    expect(
      isSellerPayoutRailReady({
        preferredSellerPayoutProcessor: "PAYPAL",
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        paypalPayoutEmail: "seller@example.com",
        paypalPayoutVerifiedAt: new Date(),
      }),
    ).toBe(true);
    expect(
      isSellerPayoutRailReady({
        preferredSellerPayoutProcessor: "PAYPAL",
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        paypalPayoutEmail: "seller@example.com",
        paypalPayoutVerifiedAt: null,
      }),
    ).toBe(false);

    process.env.PAYPAL_SELLER_PAYOUTS_ENABLED = prev;
    process.env.PAYPAL_CLIENT_ID = id;
    process.env.PAYPAL_CLIENT_SECRET = secret;
  });

  it("normalizes PayPal emails", () => {
    expect(normalizePayPalPayoutEmail("  Seller@Example.COM ")).toBe("seller@example.com");
    expect(normalizePayPalPayoutEmail("not-an-email")).toBeNull();
  });
});
