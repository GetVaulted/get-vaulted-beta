import { describe, expect, it } from "vitest";
import {
  BLOCKED_STRIPE_PAYMENT_METHOD_TYPES,
  INSTANT_STRIPE_PAYMENT_METHOD_TYPES,
  MARKETPLACE_BNPL_STRIPE_PAYMENT_METHOD_TYPES,
  assertLivePaymentMethodPolicy,
  checkoutPaymentMethodTypesForLane,
  isLiveEligibleStripePaymentMethodType,
  paymentMethodTypesIncludeBnpl,
  resolveBuyNowCheckoutLane,
  resolveOrderCheckoutLane,
  stripeCheckoutSessionPaymentOptions,
  stripeOffSessionPaymentIntentOptions,
  stripeSetupIntentPaymentOptions,
  walletMethodEligibilityLabel,
  WALLET_METHOD_CATALOG,
} from "@/lib/stripe-payment-method-config";

describe("stripe-payment-method-config", () => {
  it("live checkout excludes BNPL and delayed bank methods", () => {
    const types = checkoutPaymentMethodTypesForLane("live");
    expect(paymentMethodTypesIncludeBnpl(types)).toBe(false);
    for (const blocked of BLOCKED_STRIPE_PAYMENT_METHOD_TYPES) {
      expect(types).not.toContain(blocked);
    }
    expect(types).toEqual(expect.arrayContaining([...INSTANT_STRIPE_PAYMENT_METHOD_TYPES]));
    expect(assertLivePaymentMethodPolicy(types)).toBeUndefined();
  });

  it("marketplace checkout includes BNPL when configured", () => {
    const types = checkoutPaymentMethodTypesForLane("marketplace");
    for (const bnpl of MARKETPLACE_BNPL_STRIPE_PAYMENT_METHOD_TYPES) {
      expect(types).toContain(bnpl);
    }
    expect(types).toEqual(
      expect.arrayContaining([...INSTANT_STRIPE_PAYMENT_METHOD_TYPES, ...MARKETPLACE_BNPL_STRIPE_PAYMENT_METHOD_TYPES]),
    );
  });

  it("trade checkout excludes BNPL", () => {
    const types = checkoutPaymentMethodTypesForLane("trade");
    expect(paymentMethodTypesIncludeBnpl(types)).toBe(false);
  });

  it("wallet setup intent includes optional instant methods by default", () => {
    const { payment_method_types } = stripeSetupIntentPaymentOptions();
    expect(paymentMethodTypesIncludeBnpl(payment_method_types)).toBe(false);
    expect(payment_method_types).toEqual(
      expect.arrayContaining(["card", "link", "cashapp", "amazon_pay"]),
    );
  });

  it("off-session recovery PaymentIntent excludes BNPL for live and marketplace", () => {
    expect(stripeOffSessionPaymentIntentOptions("live").payment_method_types).toEqual([
      ...INSTANT_STRIPE_PAYMENT_METHOD_TYPES,
    ]);
    const { payment_method_types } = stripeOffSessionPaymentIntentOptions("marketplace");
    expect(payment_method_types).toEqual([...INSTANT_STRIPE_PAYMENT_METHOD_TYPES]);
    expect(paymentMethodTypesIncludeBnpl(payment_method_types)).toBe(false);
  });

  it("assertLivePaymentMethodPolicy rejects BNPL and ACH", () => {
    expect(() =>
      assertLivePaymentMethodPolicy([...INSTANT_STRIPE_PAYMENT_METHOD_TYPES, "affirm"]),
    ).toThrow("LIVE_CHECKOUT_BNPL_NOT_ALLOWED");
    expect(() =>
      assertLivePaymentMethodPolicy([...INSTANT_STRIPE_PAYMENT_METHOD_TYPES, "us_bank_account"]),
    ).toThrow("LIVE_CHECKOUT_DELAYED_PAYMENT_NOT_ALLOWED");
  });

  it("resolves checkout lanes from order context", () => {
    expect(resolveBuyNowCheckoutLane("lri_123")).toBe("live");
    expect(resolveBuyNowCheckoutLane(null)).toBe("marketplace");
    expect(
      resolveOrderCheckoutLane({ liveShippingSessionId: "lss_1", liveRoomItemId: null }),
    ).toBe("live");
    expect(resolveOrderCheckoutLane({ liveShippingSessionId: null, liveRoomItemId: null })).toBe(
      "marketplace",
    );
  });

  it("stripeCheckoutSessionPaymentOptions returns explicit payment_method_types", () => {
    expect(stripeCheckoutSessionPaymentOptions("live").payment_method_types).toEqual(
      checkoutPaymentMethodTypesForLane("live"),
    );
  });

  it("wallet catalog labels BNPL as marketplace checkout only", () => {
    const affirm = WALLET_METHOD_CATALOG.find((e) => e.id === "affirm");
    const apple = WALLET_METHOD_CATALOG.find((e) => e.id === "apple_pay");
    expect(affirm).toBeTruthy();
    expect(apple).toBeTruthy();
    expect(walletMethodEligibilityLabel(affirm!)).toBe("Marketplace checkout only");
    expect(walletMethodEligibilityLabel(apple!)).toBe("Available for Live, Marketplace, Trade");
  });

  it("treats cashapp and card as live-eligible instant methods", () => {
    expect(isLiveEligibleStripePaymentMethodType("card")).toBe(true);
    expect(isLiveEligibleStripePaymentMethodType("cashapp")).toBe(true);
    expect(isLiveEligibleStripePaymentMethodType("affirm")).toBe(false);
    expect(isLiveEligibleStripePaymentMethodType("us_bank_account")).toBe(false);
  });

  it("includes Venmo in the live wallet catalog", () => {
    const venmo = WALLET_METHOD_CATALOG.find((e) => e.id === "venmo");
    expect(venmo).toBeTruthy();
    expect(venmo!.eligibility).toEqual(expect.arrayContaining(["live", "marketplace", "trade"]));
    expect(venmo!.savableInWallet).toBe(true);
  });
});
