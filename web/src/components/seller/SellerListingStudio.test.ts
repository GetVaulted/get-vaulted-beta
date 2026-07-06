import { describe, expect, it } from "vitest";
import { parseStrictDecimal } from "./SellerListingStudio";

describe("parseStrictDecimal", () => {
  it("accepts plain positive decimals", () => {
    expect(parseStrictDecimal("125")).toBe(125);
    expect(parseStrictDecimal("125.50")).toBe(125.5);
  });

  it("accepts zero", () => {
    expect(parseStrictDecimal("0")).toBe(0);
  });

  it("rejects scientific notation instead of silently evaluating it to a huge number", () => {
    // Regression: Number("1e10") = 10000000000, which would pass a naive `n > 0` check.
    expect(parseStrictDecimal("1e10")).toBeNull();
    expect(parseStrictDecimal("1E10")).toBeNull();
  });

  it("rejects negative input", () => {
    expect(parseStrictDecimal("-5")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(parseStrictDecimal("abc")).toBeNull();
  });

  it("rejects blank input", () => {
    expect(parseStrictDecimal("")).toBeNull();
    expect(parseStrictDecimal("   ")).toBeNull();
  });
});
