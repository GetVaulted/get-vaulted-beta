import { describe, expect, it } from "vitest";
import { pickBundledLabelDebitOrder } from "@/services/shipping/bundled-labels";

describe("pickBundledLabelDebitOrder", () => {
  it("prefers the Stripe order with the largest shipping charge", () => {
    const picked = pickBundledLabelDebitOrder([
      { id: "a", stripePaymentIntentId: "pi_a", shippingChargedCents: 0 },
      { id: "b", stripePaymentIntentId: "pi_b", shippingChargedCents: 999 },
      { id: "c", stripePaymentIntentId: null, shippingChargedCents: 5000 },
    ]);
    expect(picked?.id).toBe("b");
  });

  it("falls back to non-Stripe orders when none have a payment intent", () => {
    const picked = pickBundledLabelDebitOrder([
      { id: "a", stripePaymentIntentId: null, shippingChargedCents: 100 },
      { id: "b", stripePaymentIntentId: null, shippingChargedCents: 400 },
    ]);
    expect(picked?.id).toBe("b");
  });

  it("returns null for an empty list", () => {
    expect(pickBundledLabelDebitOrder([])).toBeNull();
  });
});
