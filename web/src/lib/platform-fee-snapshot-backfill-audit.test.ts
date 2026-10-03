import { describe, expect, it } from "vitest";
import {
  HISTORICAL_LIVE_SHOW_FEE_DEFAULTS,
  classifyPlatformFeeBackfillRow,
  implyPlatformFeeCentsFromStripe,
  liveShowFeePercentForGmv,
  matchFeePercentToCents,
  priorShowGmvUsdBeforeOrder,
  resolveLiveShowFeeConfigAsOf,
} from "@/lib/platform-fee-snapshot-backfill-audit";
import { applicationFeeCentsFromSubtotalUsd } from "@/lib/platform-fee-policy";
import { estimateStripeProcessingFeeCents } from "@/lib/seller-payout-estimate";

const currentConfig = {
  tier1FeePercent: 6.75,
  tier2ThresholdUsd: 3000,
  tier2FeePercent: 5.75,
  tier3ThresholdUsd: 5500,
  tier3FeePercent: 5,
};

describe("platform-fee-snapshot-backfill-audit", () => {
  it("uses seed defaults before config updatedAt and current config after", () => {
    const cutover = new Date("2026-07-14T12:00:00.000Z");
    const before = resolveLiveShowFeeConfigAsOf({
      orderCreatedAt: new Date("2026-07-10T00:00:00.000Z"),
      currentConfig,
      currentConfigUpdatedAt: cutover,
    });
    expect(before.config).toEqual(HISTORICAL_LIVE_SHOW_FEE_DEFAULTS);
    expect(before.proven).toBe(true);

    const after = resolveLiveShowFeeConfigAsOf({
      orderCreatedAt: new Date("2026-07-15T00:00:00.000Z"),
      currentConfig,
      currentConfigUpdatedAt: cutover,
    });
    expect(after.config.tier1FeePercent).toBe(6.75);
    expect(after.proven).toBe(true);
  });

  it("reconstructs prior GMV excluding unpaid and ordering by createdAt+id", () => {
    const showOrders = [
      { id: "b", createdAt: new Date("2026-07-19T03:00:00.000Z"), itemPriceUsd: 10, paymentStatus: "paid" },
      { id: "a", createdAt: new Date("2026-07-19T03:00:00.000Z"), itemPriceUsd: 5, paymentStatus: "paid" },
      { id: "c", createdAt: new Date("2026-07-19T03:01:00.000Z"), itemPriceUsd: 20, paymentStatus: "pending" },
      { id: "d", createdAt: new Date("2026-07-19T03:02:00.000Z"), itemPriceUsd: 30, paymentStatus: "paid" },
    ];
    // Same second: id "a" before "b"
    expect(priorShowGmvUsdBeforeOrder({ orderId: "b", showOrders })).toBe(5);
    expect(priorShowGmvUsdBeforeOrder({ orderId: "d", showOrders })).toBe(15);
  });

  it("never treats stripe application fee as platform fee without subtracting processing", () => {
    const item = 8;
    const platform = applicationFeeCentsFromSubtotalUsd(item, 6.75); // 54
    const charge = 800;
    const processing = estimateStripeProcessingFeeCents(charge);
    const appFee = platform + processing;
    const implied = implyPlatformFeeCentsFromStripe({
      stripeApplicationFeeCents: appFee,
      stripeProcessingFeeCents: null,
      buyerChargeCents: charge,
      taxAmountCents: 0,
    });
    expect(implied.impliedCents).toBe(platform);
    expect(implied.impliedCents).not.toBe(appFee);
  });

  it("preserves Stripe-proven historical 8% over current 6.75% reconstruction", () => {
    const basisUsd = 100;
    const fee8 = applicationFeeCentsFromSubtotalUsd(basisUsd, 8);
    const processing = estimateStripeProcessingFeeCents(10500);
    const row = classifyPlatformFeeBackfillRow({
      orderId: "o1",
      createdAt: new Date("2026-07-19T00:00:00.000Z"),
      sellerId: "s1",
      sellerHandle: "dtdt",
      liveShowId: "show1",
      itemPriceUsd: 100,
      quantity: 1,
      totalUsd: 105,
      taxAmountCents: 0,
      paymentStatus: "paid",
      isCompanyListing: false,
      stripeApplicationFeeCents: fee8 + processing,
      stripeProcessingFeeCents: null,
      existingPlatformFeeCents: null,
      existingPlatformFeePercentApplied: null,
      existingPlatformFeeBasisCents: null,
      existingPlatformFeePriorShowGmvUsd: null,
      existingPlatformFeeSellerOverrideApplied: false,
      priorCompletedShowGmvUsd: 0,
      sellerOverridePercentAtCharge: null,
      overrideProvenFromAudit: false,
      liveConfig: currentConfig,
      liveConfigUpdatedAt: new Date("2026-07-14T00:00:00.000Z"),
      marketplaceFeePercent: 8,
      marketplaceFeeUpdatedAt: new Date("2026-07-14T00:00:00.000Z"),
    });
    expect(row.confidence).toBe("VERIFIED_FROM_STRIPE_AND_ORDER_DATA");
    expect(row.platformFeePercentAppliedProposed).toBe(8);
    expect(row.platformFeeCentsProposed).toBe(800);
    expect(row.wouldWrite).toBe(true);
  });

  it("accepts proven reconstruction when Stripe cents agree but percent is rounding-ambiguous", () => {
    const processing = estimateStripeProcessingFeeCents(100);
    const row = classifyPlatformFeeBackfillRow({
      orderId: "tiny",
      createdAt: new Date("2026-07-19T00:00:00.000Z"),
      sellerId: "s1",
      sellerHandle: "dtdt",
      liveShowId: "show1",
      itemPriceUsd: 1,
      quantity: 1,
      totalUsd: 1,
      taxAmountCents: 0,
      paymentStatus: "paid",
      isCompanyListing: false,
      stripeApplicationFeeCents: 7 + processing,
      stripeProcessingFeeCents: null,
      existingPlatformFeeCents: null,
      existingPlatformFeePercentApplied: null,
      existingPlatformFeeBasisCents: null,
      existingPlatformFeePriorShowGmvUsd: null,
      existingPlatformFeeSellerOverrideApplied: false,
      priorCompletedShowGmvUsd: 1830,
      sellerOverridePercentAtCharge: null,
      overrideProvenFromAudit: false,
      liveConfig: currentConfig,
      liveConfigUpdatedAt: new Date("2026-07-14T00:00:00.000Z"),
      marketplaceFeePercent: 8,
      marketplaceFeeUpdatedAt: new Date("2026-07-14T00:00:00.000Z"),
    });
    expect(row.confidence).toBe("VERIFIED_FROM_STRIPE_AND_ORDER_DATA");
    expect(row.platformFeePercentAppliedProposed).toBe(6.75);
    expect(row.platformFeeCentsProposed).toBe(7);
    expect(row.wouldWrite).toBe(true);
  });

  it("marks ambiguous when Stripe app fee does not match a known rate", () => {
    const row = classifyPlatformFeeBackfillRow({
      orderId: "o2",
      createdAt: new Date("2026-07-19T00:00:00.000Z"),
      sellerId: "s1",
      sellerHandle: "dtdt",
      liveShowId: "show1",
      itemPriceUsd: 100,
      quantity: 1,
      totalUsd: 105,
      taxAmountCents: 0,
      paymentStatus: "paid",
      isCompanyListing: false,
      stripeApplicationFeeCents: 1234,
      stripeProcessingFeeCents: 100,
      existingPlatformFeeCents: null,
      existingPlatformFeePercentApplied: null,
      existingPlatformFeeBasisCents: null,
      existingPlatformFeePriorShowGmvUsd: null,
      existingPlatformFeeSellerOverrideApplied: false,
      priorCompletedShowGmvUsd: 0,
      sellerOverridePercentAtCharge: null,
      overrideProvenFromAudit: false,
      liveConfig: currentConfig,
      liveConfigUpdatedAt: new Date("2026-07-14T00:00:00.000Z"),
      marketplaceFeePercent: 8,
      marketplaceFeeUpdatedAt: new Date("2026-07-14T00:00:00.000Z"),
    });
    expect(row.confidence).toBe("AMBIGUOUS_MANUAL_REVIEW");
    expect(row.wouldWrite).toBe(false);
  });

  it("matches fee percent uniquely to cents", () => {
    expect(
      matchFeePercentToCents({
        basisUsd: 100,
        feeCents: 675,
        candidatePercents: [8, 7.25, 6.75, 5.75],
      }),
    ).toBe(6.75);
  });

  it("tier percent for GMV under historical vs current thresholds", () => {
    expect(liveShowFeePercentForGmv(1868, HISTORICAL_LIVE_SHOW_FEE_DEFAULTS)).toBe(7.25);
    expect(liveShowFeePercentForGmv(1868, currentConfig)).toBe(6.75);
  });
});
