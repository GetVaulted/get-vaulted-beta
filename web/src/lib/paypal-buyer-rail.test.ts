import { describe, expect, it } from "vitest";
import {
  isPayPalRailWalletPaymentMethodId,
  paypalRailWalletMethodType,
} from "@/lib/paypal-buyer-rail";
import {
  isPayPalWalletPaymentMethodId,
  paypalPaymentTokenIdFromWalletPmId,
  paypalWalletPaymentMethodId,
} from "@/lib/paypal-buyer-wallet";

describe("paypal-buyer-rail helpers", () => {
  it("recognizes vaulted Venmo and PayPal wallet payment method ids", () => {
    expect(isPayPalRailWalletPaymentMethodId("venmo_tok_abc")).toBe(true);
    expect(isPayPalRailWalletPaymentMethodId("paypal_tok_xyz")).toBe(true);
    expect(isPayPalRailWalletPaymentMethodId("pm_card_123")).toBe(false);
    expect(isPayPalRailWalletPaymentMethodId("")).toBe(false);
    expect(isPayPalRailWalletPaymentMethodId(null)).toBe(false);
  });

  it("maps rail ids to wallet method types", () => {
    expect(paypalRailWalletMethodType("paypal_tok_xyz")).toBe("paypal");
    expect(paypalRailWalletMethodType("venmo_tok_abc")).toBe("venmo");
  });

  it("builds and parses PayPal wallet payment method ids", () => {
    const id = paypalWalletPaymentMethodId("tok_abc");
    expect(id).toBe("paypal_tok_abc");
    expect(isPayPalWalletPaymentMethodId(id)).toBe(true);
    expect(paypalPaymentTokenIdFromWalletPmId(id)).toBe("tok_abc");
  });
});
