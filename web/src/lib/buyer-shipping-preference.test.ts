import { describe, expect, it } from "vitest";
import {
  checkoutRatePreferenceKey,
  pickCheckoutShippingRate,
} from "@/lib/buyer-shipping-preference";

const rates = [
  { id: "cheap", carrier: "USPS", serviceLevel: "Ground Advantage", amount: "8.00" },
  { id: "fast", carrier: "UPS", serviceLevel: "Ground", amount: "11.00" },
];

describe("pickCheckoutShippingRate", () => {
  it("uses saved carrier preference when offered", () => {
    const key = checkoutRatePreferenceKey(rates[1]!);
    expect(pickCheckoutShippingRate(rates, key)?.id).toBe("fast");
  });

  it("falls back to first quote when preference unavailable", () => {
    expect(pickCheckoutShippingRate(rates, "FedEx|Express")?.id).toBe("cheap");
  });
});
