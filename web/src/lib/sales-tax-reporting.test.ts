import { describe, expect, it } from "vitest";
import { effectiveOrderTaxAmountCents } from "@/lib/sales-tax-reporting";

describe("sales-tax-reporting", () => {
  it("uses taxAmountCents when present", () => {
    expect(effectiveOrderTaxAmountCents({ taxAmountCents: 825, taxUsd: 0 })).toBe(825);
  });

  it("falls back to taxUsd for legacy orders", () => {
    expect(effectiveOrderTaxAmountCents({ taxAmountCents: 0, taxUsd: 8.25 })).toBe(825);
  });
});
