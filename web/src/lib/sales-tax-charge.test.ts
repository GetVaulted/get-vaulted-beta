import { describe, expect, it } from "vitest";
import {
  connectPaymentIntentTransferData,
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

describe("connectPaymentIntentTransferData — seller absorbs Stripe processing", () => {
  it("adds the processing fee to application_fee_amount on untaxed charges", () => {
    const data = connectPaymentIntentTransferData({
      destinationAccountId: "acct_seller",
      applicationFeeCents: 675,
      sellerTransferCents: null,
      processingFeeCents: 320,
    });
    expect(data.application_fee_amount).toBe(995);
    expect(data.transfer_data).toEqual({ destination: "acct_seller" });
  });

  it("subtracts the processing fee from the seller transfer on taxed charges", () => {
    const data = connectPaymentIntentTransferData({
      destinationAccountId: "acct_seller",
      applicationFeeCents: 675,
      sellerTransferCents: 9325,
      processingFeeCents: 320,
    });
    expect(data.application_fee_amount).toBeUndefined();
    expect(data.transfer_data).toEqual({ destination: "acct_seller", amount: 9005 });
  });

  it("absorbs nothing when processingFeeCents is 0 or omitted (e.g. tips)", () => {
    const data = connectPaymentIntentTransferData({
      destinationAccountId: "acct_seller",
      applicationFeeCents: 0,
      sellerTransferCents: null,
    });
    expect(data.application_fee_amount).toBe(0);
  });

  it("never drives the seller transfer negative", () => {
    const data = connectPaymentIntentTransferData({
      destinationAccountId: "acct_seller",
      applicationFeeCents: 0,
      sellerTransferCents: 100,
      processingFeeCents: 500,
    });
    expect(data.transfer_data).toEqual({ destination: "acct_seller", amount: 0 });
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
