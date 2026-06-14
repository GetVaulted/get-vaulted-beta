import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  extractCheckoutChargeBreakdownFromSession,
  orderChargeBreakdownNeedsRepair,
} from "@/lib/stripe-checkout-breakdown";
import { STRIPE_TAX_CODE_SHIPPING, STRIPE_TAX_CODE_TANGIBLE } from "@/lib/stripe-tax";

describe("stripe-checkout-breakdown", () => {
  it("parses item, shipping, and tax line items", () => {
    const session = {
      amount_total: 87684,
      total_details: { amount_tax: 2684 },
      metadata: {},
    } as Stripe.Checkout.Session;

    const lineItems = [
      {
        description: "Jordan 1 Retro",
        amount_total: 80000,
        price: { product: { tax_code: STRIPE_TAX_CODE_TANGIBLE } },
      },
      {
        description: "Shipping",
        amount_total: 5000,
        price: { product: { tax_code: STRIPE_TAX_CODE_SHIPPING } },
      },
      {
        description: "Sales tax",
        amount_total: 2684,
        price: { product: {} },
      },
    ] as Stripe.LineItem[];

    const b = extractCheckoutChargeBreakdownFromSession(session, lineItems);
    expect(b.itemPriceUsd).toBe(800);
    expect(b.shippingPriceUsd).toBe(50);
    expect(b.taxUsd).toBe(26.84);
    expect(b.totalUsd).toBe(876.84);
  });

  it("detects lump-sum item stored as total", () => {
    expect(
      orderChargeBreakdownNeedsRepair({
        itemPriceUsd: 876.84,
        shippingPriceUsd: 0,
        taxUsd: 0,
        taxAmountCents: 0,
        totalUsd: 876.84,
        shippingChargedCents: null,
        stripeCheckoutSessionId: "cs_test",
      }),
    ).toBe(true);
  });
});
