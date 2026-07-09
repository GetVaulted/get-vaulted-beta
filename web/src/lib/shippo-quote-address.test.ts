import { describe, expect, it } from "vitest";
import { normalizeUsPostalCode, toShippoQuoteAddress } from "./shippo-quote-address";

describe("shippo-quote-address", () => {
  it("normalizes US state names and ZIP codes", () => {
    const addr = toShippoQuoteAddress(
      {
        name: "Buyer",
        line1: "123 Main St",
        line2: "Apt 2",
        city: "Austin",
        state: "Texas",
        postalCode: "78701",
        country: "US",
      },
      { residential: true },
    );
    expect(addr.state).toBe("TX");
    expect(addr.zip).toBe("78701");
    expect(addr.street2).toBe("Apt 2");
    expect(addr.is_residential).toBe(true);
  });

  it("pads short numeric ZIP inputs", () => {
    expect(normalizeUsPostalCode("7806")).toBe("7806");
    expect(normalizeUsPostalCode("78701-1234")).toBe("78701-1234");
  });
});
