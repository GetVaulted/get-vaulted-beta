import { describe, expect, it } from "vitest";
import {
  fullRefundAmountCents,
  proratedRefundAmountCents,
} from "@/lib/sales-tax-charge";
import { buildOrderTaxPersistFields } from "@/lib/sales-tax-order";

describe("sales-tax-charge", () => {
  it("full refund includes item, shipping, and tax", () => {
    expect(
      fullRefundAmountCents({ itemPriceUsd: 100, shippingPriceUsd: 10, taxAmountCents: 825 }),
    ).toBe(11825);
  });

  it("partial refund prorates tax", () => {
    const { refundCents, taxRefundedCents } = proratedRefundAmountCents(
      { itemPriceUsd: 100, shippingPriceUsd: 10, taxAmountCents: 825 },
      50,
    );
    expect(taxRefundedCents).toBe(413);
    expect(refundCents).toBeGreaterThan(5000);
  });

  it("order tax fields separate taxable subtotal from total", () => {
    const fields = buildOrderTaxPersistFields({
      itemPriceUsd: 100,
      shippingPriceUsd: 10,
      taxAmountCents: 825,
      taxJurisdictionState: "TX",
    });
    expect(fields.totalUsd).toBeCloseTo(118.25);
    expect(fields.taxTaxableSubtotalCents).toBe(10000);
    expect(fields.taxShippingTaxableCents).toBe(1000);
    expect(fields.taxJurisdictionState).toBe("TX");
  });
});

describe("Texas-only collection scenarios (invariants)", () => {
  it("non-TX ship-to with disabled state => zero tax in persist helper", () => {
    const fields = buildOrderTaxPersistFields({
      itemPriceUsd: 100,
      shippingPriceUsd: 5,
      taxAmountCents: 0,
      taxJurisdictionState: "CA",
    });
    expect(fields.taxAmountCents).toBe(0);
    expect(fields.totalUsd).toBe(105);
  });
});
