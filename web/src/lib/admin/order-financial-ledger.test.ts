import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/platform-fee-settings", () => ({
  getCachedMarketplacePlatformFeePercent: () => 8,
  ensureMarketplacePlatformFeeCache: vi.fn(),
}));

vi.mock("@/services/live-show-fee-settings", () => ({
  getCachedLiveShowFeeConfig: () => ({
    tier1FeePercent: 8,
    tier2ThresholdUsd: 1000,
    tier2FeePercent: 7.25,
    tier3ThresholdUsd: 3000,
    tier3FeePercent: 6.5,
  }),
  ensureLiveShowFeeCache: vi.fn(),
}));

import {
  buildOrderFinancialLedger,
  resolveActualLabelCostCents,
  type OrderLedgerInput,
} from "@/lib/admin/order-financial-ledger";

function base(overrides: Partial<OrderLedgerInput> = {}): OrderLedgerInput {
  return {
    id: "ord_1",
    createdAt: new Date("2026-07-18T00:00:00Z"),
    paymentStatus: "paid",
    fulfillmentStatus: "label_created",
    payoutStatus: "held",
    shippingStatus: "SUCCESS",
    itemPriceUsd: 33,
    shippingPriceUsd: 1,
    shippingChargedCents: 100,
    taxUsd: 2.81,
    taxAmountCents: 281,
    taxRefundedCents: 0,
    totalUsd: 36.81,
    referralCreditAppliedUsd: 0,
    stripePaymentIntentId: "pi_1",
    stripeChargeId: "ch_1",
    stripeBalanceTransactionId: "txn_1",
    stripeProcessingFeeCents: 137,
    stripeApplicationFeeCents: null,
    stripeNetCents: 3544,
    stripeTransferId: "tr_1",
    stripeTaxCalculationId: "taxcalc_1",
    stripeTaxTransactionId: "tax_1",
    stripeTaxTransactionReversalId: null,
    taxJurisdictionState: "TX",
    shippingLabelCostCents: 589,
    shippingLabelCostReversedCents: 589,
    shippingLabelCostReversalId: "trr_1",
    shippoTransactionId: "shippo_tx",
    shippoShipmentId: "shippo_sh",
    trackingNumber: "9400",
    labelCreatedAt: new Date("2026-07-18T12:00:00Z"),
    estimatedLabelCostCents: 499,
    payoutReserveAmountCents: 0,
    isCompanyListing: false,
    buyingFormat: "auction",
    liveShowId: "show_1",
    liveShowCompletedGmvUsd: 500,
    liveShowStatus: "ended",
    sellerPlatformFeePercentOverride: null,
    buyerUsername: "buyer",
    sellerUsername: "seller",
    listingTitle: "Test item",
    stripeTransferAmountCents: 3040,
    ...overrides,
  };
}

describe("resolveActualLabelCostCents", () => {
  it("uses order shippingLabelCostCents over package", () => {
    expect(
      resolveActualLabelCostCents({ shippingLabelCostCents: 589, packageLabelCostCents: 100 }),
    ).toBe(589);
  });

  it("falls back to package label cost", () => {
    expect(resolveActualLabelCostCents({ shippingLabelCostCents: null, packageLabelCostCents: 400 })).toBe(
      400,
    );
  });

  it("does not invent cost from estimates", () => {
    expect(resolveActualLabelCostCents({ shippingLabelCostCents: null })).toBeNull();
  });
});

describe("buildOrderFinancialLedger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("taxes destination charge: tax is liability not revenue; fee on item only", () => {
    const ledger = buildOrderFinancialLedger(base({ sellerPlatformFeePercentOverride: 6.75 }));
    expect(ledger.itemSubtotalCents).toBe(3300);
    expect(ledger.buyerShippingCents).toBe(100);
    expect(ledger.salesTaxCents).toBe(281);
    expect(ledger.customerTotalCents).toBe(3681);
    expect(ledger.platformFeeCents.cents).toBe(223); // 33 * 6.75%
    expect(ledger.platformEarnedRevenueCents).toBe(223);
    expect(ledger.platformHeldTaxCents).toBe(281);
    expect(ledger.platformEarnedRevenueCents).not.toBe(223 + 281);
  });

  it("uses actual Stripe BT fee over estimate", () => {
    const ledger = buildOrderFinancialLedger(base());
    expect(ledger.stripeProcessingFeeCents.source).toBe("actual");
    expect(ledger.stripeProcessingFeeCents.cents).toBe(137);
  });

  it("marks processing fee estimated when BT fee missing", () => {
    const ledger = buildOrderFinancialLedger(base({ stripeProcessingFeeCents: null }));
    expect(ledger.stripeProcessingFeeCents.source).toBe("estimated");
    expect(ledger.stripeProcessingFeeCents.cents).toBeGreaterThan(0);
  });

  it("company listing with missing BT fee does not invent processing on seller transfer", () => {
    const ledger = buildOrderFinancialLedger(
      base({
        isCompanyListing: true,
        stripeProcessingFeeCents: null,
        stripeTransferAmountCents: null,
        sellerPlatformFeePercentOverride: null,
      }),
    );
    expect(ledger.stripeProcessingFeeCents.cents).toBe(0);
    expect(ledger.stripeProcessingFeeCents.source).toBe("actual");
    // Company fee 0 → desired transfer = item + shipping (no processing haircut)
    expect(ledger.sellerTransferCents.cents).toBe(3300 + 100);
  });

  it("non-taxed path has zero tax liability", () => {
    const ledger = buildOrderFinancialLedger(
      base({ taxAmountCents: 0, taxUsd: 0, totalUsd: 34, stripeTaxTransactionId: null }),
    );
    expect(ledger.salesTaxCents).toBe(0);
    expect(ledger.platformHeldTaxCents).toBe(0);
  });

  it("buyer shipping is credited to seller, not platform revenue", () => {
    const ledger = buildOrderFinancialLedger(base());
    expect(ledger.sections.seller.buyerShippingCreditedCents).toBe(100);
    expect(ledger.platformEarnedRevenueCents).toBe(ledger.platformFeeCents.cents);
  });

  it("label purchase with exact reversal reconciles shipping variance to 0", () => {
    const ledger = buildOrderFinancialLedger(base());
    expect(ledger.actualLabelCostCents.cents).toBe(589);
    expect(ledger.sellerLabelDeductionCents).toBe(589);
    expect(ledger.platformShippingVarianceCents).toBe(0);
  });

  it("failed label reversal creates exception", () => {
    const ledger = buildOrderFinancialLedger(
      base({
        shippingLabelCostReversedCents: 0,
        shippingLabelCostReversalId: null,
        shippingStatus: "label_cost_reversal_failed",
      }),
    );
    expect(ledger.reconciliationStatus).toBe("exception");
    expect(ledger.everythingReconciled).toBe(false);
    expect(ledger.varianceReasons.some((r) => r.includes("reimbursement") || r.includes("failed"))).toBe(
      true,
    );
  });

  it("seller final net = transfer − label deduction", () => {
    const ledger = buildOrderFinancialLedger(base({ stripeTransferAmountCents: 4599 }));
    expect(ledger.sellerFinalNetCents.cents).toBe(4599 - 589);
  });

  it("zero-variance order with actual fees and reimbursed label", () => {
    const ledger = buildOrderFinancialLedger(
      base({
        sellerPlatformFeePercentOverride: 6.75,
      }),
    );
    // keep = customer - transfer = 3681 - 3040 = 641
    // expected = fee + proc + tax = 223 + 137 + 281 = 641
    expect(ledger.finalVarianceCents).toBe(0);
  });

  it("does not use stripeApplicationFeeCents as platform fee (taxed / mixed app-fee paths)", () => {
    const ledger = buildOrderFinancialLedger(
      base({
        sellerPlatformFeePercentOverride: 6.75,
        // Inflated Stripe app-fee amount (e.g. fee+processing) must not become platform revenue
        stripeApplicationFeeCents: 223 + 137,
      }),
    );
    expect(ledger.platformFeeCents.cents).toBe(223);
    expect(ledger.platformEarnedRevenueCents).toBe(223);
    expect(ledger.sections.stripe.stripeApplicationFeeAmountCents).toBe(360);
  });

  it("chargeback flags dispute loss", () => {
    const ledger = buildOrderFinancialLedger(base({ paymentStatus: "chargeback" }));
    expect(ledger.reconciliationStatus).toBe("chargeback");
    expect(ledger.disputeLossCents).toBe(3681);
  });

  it("full refund marks refunded status", () => {
    const ledger = buildOrderFinancialLedger(base({ paymentStatus: "refunded" }));
    expect(ledger.reconciliationStatus).toBe("refunded");
    expect(ledger.amountRefundedCents).toBe(3681);
    expect(ledger.finalBuyerPaidCents).toBe(0);
  });

  it("ignores session estimate when no purchased label", () => {
    const ledger = buildOrderFinancialLedger(
      base({
        shippingLabelCostCents: null,
        shippingLabelCostReversedCents: 0,
        shippoTransactionId: null,
        estimatedLabelCostCents: 499,
        fulfillmentStatus: "pending",
        packageLabelCostCents: null,
      }),
    );
    expect(ledger.actualLabelCostCents.cents).toBeNull();
    expect(ledger.actualLabelCostCents.source).toBe("unavailable");
  });

  it("valid multiple chargeable labels show reconciled without retry", () => {
    const ledger = buildOrderFinancialLedger(
      base({
        shippingLabelCostCents: 3502,
        shippingLabelCostReversedCents: 3502,
        labelFinances: [
          {
            id: "lf_1",
            orderId: "ord_1",
            shippoTransactionId: "tx_1",
            shippoShipmentId: "sh_1",
            labelCostCents: 1751,
            purpose: "initial",
            replacesShippoTransactionId: null,
            status: "replaced",
            sellerClawbackCents: 1751,
            sellerClawbackReversalId: "trr_1",
            sellerCreditCents: 0,
            sellerCreditTransferId: null,
            clawbackIdempotencyKey: "k1",
            creditIdempotencyKey: null,
          },
          {
            id: "lf_2",
            orderId: "ord_1",
            shippoTransactionId: "tx_2",
            shippoShipmentId: "sh_2",
            labelCostCents: 1751,
            purpose: "replacement",
            replacesShippoTransactionId: "tx_1",
            status: "active",
            sellerClawbackCents: 1751,
            sellerClawbackReversalId: "trr_2",
            sellerCreditCents: 0,
            sellerCreditTransferId: null,
            clawbackIdempotencyKey: "k2",
            creditIdempotencyKey: null,
          },
        ],
      }),
    );
    expect(ledger.chargeableLabelCostCents).toBe(3502);
    expect(ledger.sellerLabelDeductionCents).toBe(3502);
    expect(ledger.labelFinanceActionStatus).toBe("reconciled_multiple_labels");
    expect(ledger.needsLabelCostRetry).toBe(false);
    expect(ledger.reconciliationStatus).toBe("reconciled");
    expect(ledger.labelFinanceRows).toHaveLength(2);
  });

  it("retry only when a chargeable label is missing clawback", () => {
    const ledger = buildOrderFinancialLedger(
      base({
        shippingLabelCostCents: 1751,
        shippingLabelCostReversedCents: 0,
        labelFinances: [
          {
            id: "lf_1",
            orderId: "ord_1",
            shippoTransactionId: "tx_1",
            shippoShipmentId: "sh_1",
            labelCostCents: 1751,
            purpose: "initial",
            replacesShippoTransactionId: null,
            status: "active",
            sellerClawbackCents: 0,
            sellerClawbackReversalId: null,
            sellerCreditCents: 0,
            sellerCreditTransferId: null,
            clawbackIdempotencyKey: null,
            creditIdempotencyKey: null,
          },
        ],
      }),
    );
    expect(ledger.needsLabelCostRetry).toBe(true);
    expect(ledger.labelFinanceActionStatus).toBe("seller_charge_required");
  });

  it("overcharge shows seller credit required and no retry", () => {
    const ledger = buildOrderFinancialLedger(
      base({
        shippingLabelCostCents: 1751,
        shippingLabelCostReversedCents: 3502,
        labelFinances: [
          {
            id: "lf_1",
            orderId: "ord_1",
            shippoTransactionId: "tx_1",
            shippoShipmentId: "sh_1",
            labelCostCents: 1751,
            purpose: "initial",
            replacesShippoTransactionId: null,
            status: "refunded",
            sellerClawbackCents: 1751,
            sellerClawbackReversalId: "trr_1",
            sellerCreditCents: 0,
            sellerCreditTransferId: null,
            clawbackIdempotencyKey: "k1",
            creditIdempotencyKey: null,
          },
          {
            id: "lf_2",
            orderId: "ord_1",
            shippoTransactionId: "tx_2",
            shippoShipmentId: "sh_2",
            labelCostCents: 1751,
            purpose: "replacement",
            replacesShippoTransactionId: "tx_1",
            status: "active",
            sellerClawbackCents: 1751,
            sellerClawbackReversalId: "trr_2",
            sellerCreditCents: 0,
            sellerCreditTransferId: null,
            clawbackIdempotencyKey: "k2",
            creditIdempotencyKey: null,
          },
        ],
      }),
    );
    expect(ledger.chargeableLabelCostCents).toBe(1751);
    expect(ledger.sellerLabelDeductionCents).toBe(3502);
    expect(ledger.labelFinanceActionStatus).toBe("seller_credit_required");
    expect(ledger.needsLabelCostRetry).toBe(false);
    expect(ledger.reconciliationStatus).toBe("exception");
  });

  it("order summary fields match label-level records", () => {
    const ledger = buildOrderFinancialLedger(
      base({
        // Stale order summary should be overridden by label finance rows.
        shippingLabelCostCents: 1751,
        shippingLabelCostReversedCents: 3502,
        labelFinances: [
          {
            id: "lf_1",
            orderId: "ord_1",
            shippoTransactionId: "tx_1",
            shippoShipmentId: null,
            labelCostCents: 1751,
            purpose: "initial",
            replacesShippoTransactionId: null,
            status: "refunded",
            sellerClawbackCents: 1751,
            sellerClawbackReversalId: "trr_1",
            sellerCreditCents: 1751,
            sellerCreditTransferId: "tr_credit",
            clawbackIdempotencyKey: "k1",
            creditIdempotencyKey: "c1",
          },
          {
            id: "lf_2",
            orderId: "ord_1",
            shippoTransactionId: "tx_2",
            shippoShipmentId: null,
            labelCostCents: 1751,
            purpose: "replacement",
            replacesShippoTransactionId: "tx_1",
            status: "active",
            sellerClawbackCents: 1751,
            sellerClawbackReversalId: "trr_2",
            sellerCreditCents: 0,
            sellerCreditTransferId: null,
            clawbackIdempotencyKey: "k2",
            creditIdempotencyKey: null,
          },
        ],
      }),
    );
    expect(ledger.chargeableLabelCostCents).toBe(1751);
    expect(ledger.grossSellerClawbackCents).toBe(3502);
    expect(ledger.sellerLabelCreditCents).toBe(1751);
    expect(ledger.sellerLabelDeductionCents).toBe(1751);
    expect(ledger.platformShippingVarianceCents).toBe(0);
  });

  it("platform-funded referral: fee and seller transfer use full item; platform nets fee − credit", () => {
    // Buyer paid $90 item after $10 credit; full sale $100. Fee 10% → $10. Processing $3.
    const ledger = buildOrderFinancialLedger(
      base({
        itemPriceUsd: 90,
        shippingPriceUsd: 5,
        shippingChargedCents: 500,
        taxUsd: 0,
        taxAmountCents: 0,
        totalUsd: 95,
        referralCreditAppliedUsd: 10,
        sellerPlatformFeePercentOverride: 10,
        stripeProcessingFeeCents: 300,
        stripeTransferAmountCents: null,
        stripeTaxTransactionId: null,
        liveShowId: null,
        shippingLabelCostCents: 0,
        shippingLabelCostReversedCents: 0,
      }),
    );
    expect(ledger.discountCents).toBe(1000);
    expect(ledger.platformFeeCents.cents).toBe(1000); // 10% of $100
    expect(ledger.platformEarnedRevenueCents).toBe(0); // fee − credit
    // full $100 + $5 − $10 fee − $3 processing = $92
    expect(ledger.sellerTransferCents.cents).toBe(9200);
    expect(ledger.sellerTransferCents.formula).toContain("platform-funded referral");
  });
});
