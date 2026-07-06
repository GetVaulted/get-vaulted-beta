import { describe, expect, it } from "vitest";
import { parseOfferAmount } from "./MarketplaceMakeOfferModal";

describe("parseOfferAmount", () => {
  it("accepts plain positive amounts", () => {
    expect(parseOfferAmount("45")).toBe(45);
    expect(parseOfferAmount("45.50")).toBe(45.5);
  });

  it("rejects negative input instead of silently flipping it positive", () => {
    expect(parseOfferAmount("-100")).toBeNull();
  });

  it("rejects alphabetic/mixed input instead of silently coercing it to a number", () => {
    expect(parseOfferAmount("abc123")).toBeNull();
    expect(parseOfferAmount("abc")).toBeNull();
  });

  it("rejects more than two decimal places instead of accepting unlimited precision", () => {
    expect(parseOfferAmount("200.999999999999999999")).toBeNull();
    expect(parseOfferAmount("200.999")).toBeNull();
  });

  it("accepts exactly two decimal places", () => {
    expect(parseOfferAmount("200.99")).toBe(200.99);
  });

  it("rejects blank input", () => {
    expect(parseOfferAmount("")).toBeNull();
    expect(parseOfferAmount("   ")).toBeNull();
  });
});
