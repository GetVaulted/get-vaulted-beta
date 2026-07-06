import { describe, expect, it } from "vitest";
import { parseCounterAmount } from "./SellerOffersModal";

describe("parseCounterAmount", () => {
  it("accepts plain positive amounts", () => {
    expect(parseCounterAmount("45")).toBe(45);
    expect(parseCounterAmount("45.50")).toBe(45.5);
  });

  it("rejects negative input instead of silently flipping it positive", () => {
    expect(parseCounterAmount("-100")).toBeNull();
  });

  it("rejects scientific notation and alphabetic input instead of silently coercing it", () => {
    expect(parseCounterAmount("1e10")).toBeNull();
    expect(parseCounterAmount("abc")).toBeNull();
  });

  it("rejects more than two decimal places", () => {
    expect(parseCounterAmount("45.999")).toBeNull();
  });

  it("rejects blank input", () => {
    expect(parseCounterAmount("")).toBeNull();
  });
});
