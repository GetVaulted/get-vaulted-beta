import { describe, expect, it } from "vitest";
import {
  finalizeBuyerPaymentMethodSetup,
  setupIntentIdFromClientSecret,
} from "@/lib/stripe-buyer-payment-method-setup";

describe("stripe-buyer-payment-method-setup", () => {
  it("extracts setup intent id from client secret", () => {
    expect(setupIntentIdFromClientSecret("seti_123_secret_abc")).toBe("seti_123");
    expect(setupIntentIdFromClientSecret("seti_abc_secret_xyz")).toBe("seti_abc");
    expect(setupIntentIdFromClientSecret("pi_123_secret_abc")).toBeNull();
    expect(setupIntentIdFromClientSecret("")).toBeNull();
  });

  it("exports finalizeBuyerPaymentMethodSetup dispatcher", () => {
    expect(typeof finalizeBuyerPaymentMethodSetup).toBe("function");
  });
});
