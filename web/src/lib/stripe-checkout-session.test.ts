import { describe, expect, it } from "vitest";
import { buyNowCheckoutSubtotalCents } from "@/lib/stripe-checkout-session";

describe("stripe-checkout-session", () => {
  it("sums item and shipping cents for checkout subtotal comparison", () => {
    expect(buyNowCheckoutSubtotalCents({ itemPriceUsd: 100, shippingPriceUsd: 8.42 })).toBe(10842);
    expect(buyNowCheckoutSubtotalCents({ itemPriceUsd: 50, shippingPriceUsd: 0 })).toBe(5000);
  });
});
