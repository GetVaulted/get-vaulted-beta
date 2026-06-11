import { describe, expect, it } from "vitest";
import { normalizeUsStateCode } from "@/lib/us-state-code";

describe("normalizeUsStateCode", () => {
  it("maps 2-letter codes", () => {
    expect(normalizeUsStateCode("tx")).toBe("TX");
    expect(normalizeUsStateCode("TX")).toBe("TX");
  });

  it("maps full state names", () => {
    expect(normalizeUsStateCode("Texas")).toBe("TX");
    expect(normalizeUsStateCode(" texas ")).toBe("TX");
    expect(normalizeUsStateCode("New York")).toBe("NY");
    expect(normalizeUsStateCode("District of Columbia")).toBe("DC");
  });

  it("returns null for unknown values", () => {
    expect(normalizeUsStateCode("")).toBe(null);
    expect(normalizeUsStateCode("Not A State")).toBe(null);
  });
});
