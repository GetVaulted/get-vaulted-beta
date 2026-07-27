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

  it("requires explicit buyer venmo env + credentials", () => {
    delete process.env.PAYPAL_BUYER_VENMO_ENABLED;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    expect(isBuyerVenmoPayConfigured()).toBe(false);

    process.env.PAYPAL_BUYER_VENMO_ENABLED = "true";
    process.env.PAYPAL_CLIENT_ID = "id";
    process.env.PAYPAL_CLIENT_SECRET = "secret";
    expect(isBuyerVenmoPayConfigured()).toBe(true);
  });
});
