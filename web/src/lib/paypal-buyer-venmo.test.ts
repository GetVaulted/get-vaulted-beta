import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  isVenmoWalletPaymentMethodId,
  signVenmoSetupState,
  venmoPaymentTokenIdFromWalletPmId,
  venmoWalletPaymentMethodId,
  verifyVenmoSetupState,
} from "@/lib/paypal-buyer-venmo";
import { isBuyerVenmoPayConfigured } from "@/lib/paypal-auth";

describe("paypal-buyer-venmo helpers", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.PAYPAL_BUYER_VENMO_STATE_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it("builds and parses venmo wallet payment method ids", () => {
    const id = venmoWalletPaymentMethodId("tok_abc");
    expect(id).toBe("venmo_tok_abc");
    expect(isVenmoWalletPaymentMethodId(id)).toBe(true);
    expect(venmoPaymentTokenIdFromWalletPmId(id)).toBe("tok_abc");
    expect(isVenmoWalletPaymentMethodId("pm_123")).toBe(false);
  });

  it("signs and verifies setup state", () => {
    const sig = signVenmoSetupState({ userId: "user_1", nonce: "abc" });
    expect(verifyVenmoSetupState({ userId: "user_1", nonce: "abc", sig })).toBe(true);
    expect(verifyVenmoSetupState({ userId: "user_1", nonce: "xyz", sig })).toBe(false);
  });

  it("parses PayPal error bodies", async () => {
    const { parsePayPalErrorBody } = await import("@/lib/paypal-buyer-venmo");
    const parsed = parsePayPalErrorBody(
      JSON.stringify({
        name: "UNPROCESSABLE_ENTITY",
        message: "The requested action could not be performed.",
        debug_id: "abc123",
        details: [
          {
            issue: "NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE",
            description: "Merchant not allowed to vault.",
          },
        ],
      }),
    );
    expect(parsed.issue).toBe("NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE");
    expect(parsed.debugId).toBe("abc123");
    expect(parsed.message).toContain("Merchant not allowed");
  });

  it("builds a checkoutnow fallback URL for Venmo orders", async () => {
    process.env.PAYPAL_MODE = "live";
    const { venmoCheckoutUrlForOrder } = await import("@/lib/paypal-buyer-venmo");
    expect(venmoCheckoutUrlForOrder("ORDER123")).toBe(
      "https://www.paypal.com/checkoutnow?token=ORDER123",
    );
  });
});
