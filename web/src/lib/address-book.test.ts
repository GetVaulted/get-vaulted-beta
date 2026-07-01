import { describe, expect, it } from "vitest";
import {
  isAddressComplete,
  isShippingAddressCompleteForLabels,
  parseAddressType,
  validateAddressCreateInput,
  validateAddressPatchInput,
} from "@/lib/address-book";

describe("address-book helpers", () => {
  it("parses address types", () => {
    expect(parseAddressType("ship_from")).toBe("ship_from");
    expect(parseAddressType("shipping")).toBe("shipping");
    expect(parseAddressType("bad")).toBeNull();
  });

  it("validates create payload", () => {
    const res = validateAddressCreateInput({
      type: "shipping",
      name: "Home",
      fullName: "Test User",
      line1: "1 Main",
      city: "Austin",
      state: "Texas",
      postalCode: "78701",
      country: "United States",
      phone: "5551234567",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.state).toBe("TX");
      expect(res.data.country).toBe("US");
      expect(res.data.phone).toBe("5551234567");
    }
  });

  it("requires phone for shipping addresses", () => {
    const res = validateAddressCreateInput({
      type: "shipping",
      name: "Home",
      fullName: "Test User",
      line1: "1 Main",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
    });
    expect(res.ok).toBe(false);
  });

  it("validates patch payload presence", () => {
    const none = validateAddressPatchInput({});
    expect(none.ok).toBe(false);
    const some = validateAddressPatchInput({ city: "Boston" });
    expect(some.ok).toBe(true);
  });

  it("checks completeness", () => {
    expect(
      isAddressComplete({ line1: "1 Main", city: "Austin", state: "TX", postalCode: "78701", country: "US" }),
    ).toBe(true);
    expect(isAddressComplete({ line1: "1 Main", city: "", state: "TX", postalCode: "78701", country: "US" })).toBe(
      false,
    );
  });

  it("requires phone for label-ready shipping addresses", () => {
    expect(
      isShippingAddressCompleteForLabels({
        line1: "1 Main",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US",
        phone: "5551234567",
      }),
    ).toBe(true);
    expect(
      isShippingAddressCompleteForLabels({
        line1: "1 Main",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US",
      }),
    ).toBe(false);
  });
});
