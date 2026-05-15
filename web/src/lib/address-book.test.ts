import { describe, expect, it } from "vitest";
import {
  isAddressComplete,
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
      state: "TX",
      postalCode: "78701",
    });
    expect(res.ok).toBe(true);
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
});
