import { describe, expect, it } from "vitest";
import {
  LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD,
  LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD,
  LIVE_SHOW_TIER_1_FEE_PERCENT,
  LIVE_SHOW_TIER_2_FEE_PERCENT,
  LIVE_SHOW_TIER_3_FEE_PERCENT,
} from "@/lib/platform-fee-policy";
import { buildLiveShowSellerSummaryDTO } from "@/lib/live-show-seller-summary";
import {
  aggregateShowSaleContributions,
  centsToUsd,
  feePercentToBps,
  isGrossCountablePaymentStatus,
  tierProgressPercent,
  usdToCents,
  type LiveShowSaleContribution,
} from "@/lib/live-show-seller-summary-shared";

describe("usd/cents helpers", () => {
  it("converts exact cents without floating drift", () => {
    expect(usdToCents(100)).toBe(10_000);
    expect(usdToCents(12.34)).toBe(1234);
    expect(usdToCents(0)).toBe(0);
    expect(centsToUsd(10_000)).toBe(100);
    expect(centsToUsd(1234)).toBe(12.34);
  });

  it("maps fee percent to bps", () => {
    expect(feePercentToBps(8)).toBe(800);
    expect(feePercentToBps(7.25)).toBe(725);
    expect(feePercentToBps(6.5)).toBe(650);
  });
});

describe("isGrossCountablePaymentStatus", () => {
  it("includes paid/refunded/chargeback and excludes unpaid/failed", () => {
    expect(isGrossCountablePaymentStatus("paid")).toBe(true);
    expect(isGrossCountablePaymentStatus("refunded")).toBe(true);
    expect(isGrossCountablePaymentStatus("chargeback")).toBe(true);
    expect(isGrossCountablePaymentStatus("pending_payment")).toBe(false);
    expect(isGrossCountablePaymentStatus("failed")).toBe(false);
    expect(isGrossCountablePaymentStatus("expired")).toBe(false);
  });
});

describe("aggregateShowSaleContributions", () => {
  it("starts at zero for a new show", () => {
    expect(aggregateShowSaleContributions([])).toEqual({
      grossShowSalesCents: 0,
      refundedShowSalesCents: 0,
      netShowSalesCents: 0,
      paidOrderCount: 0,
    });
  });

  it("counts first paid $100 item as $100.00", () => {
    const rows: LiveShowSaleContribution[] = [
      { id: "order:1", itemSubtotalUsd: 100, refunded: false },
    ];
    expect(aggregateShowSaleContributions(rows)).toEqual({
      grossShowSalesCents: 10_000,
      refundedShowSalesCents: 0,
      netShowSalesCents: 10_000,
      paidOrderCount: 1,
    });
  });

  it("excludes shipping/tax by using item subtotal only", () => {
    // Caller must pass item subtotal — $100 item + $12 ship + $8 tax would wrongly be 12000 if total used.
    const rows: LiveShowSaleContribution[] = [
      { id: "order:1", itemSubtotalUsd: 100, refunded: false },
    ];
    expect(aggregateShowSaleContributions(rows).grossShowSalesCents).toBe(10_000);
  });

  it("aggregates multiple paid orders", () => {
    const rows: LiveShowSaleContribution[] = [
      { id: "order:1", itemSubtotalUsd: 50, refunded: false },
      { id: "order:2", itemSubtotalUsd: 25.5, refunded: false },
      { id: "break_spot:3", itemSubtotalUsd: 10, refunded: false },
    ];
    expect(aggregateShowSaleContributions(rows)).toEqual({
      grossShowSalesCents: 8550,
      refundedShowSalesCents: 0,
      netShowSalesCents: 8550,
      paidOrderCount: 3,
    });
  });

  it("ignores zero/negative and duplicate ids (webhook retry)", () => {
    const rows: LiveShowSaleContribution[] = [
      { id: "order:1", itemSubtotalUsd: 40, refunded: false },
      { id: "order:1", itemSubtotalUsd: 40, refunded: false },
      { id: "order:2", itemSubtotalUsd: 0, refunded: false },
      { id: "order:3", itemSubtotalUsd: -5, refunded: false },
    ];
    expect(aggregateShowSaleContributions(rows)).toEqual({
      grossShowSalesCents: 4000,
      refundedShowSalesCents: 0,
      netShowSalesCents: 4000,
      paidOrderCount: 1,
    });
  });

  it("keeps gross on refund while net drops", () => {
    const rows: LiveShowSaleContribution[] = [
      { id: "order:1", itemSubtotalUsd: 100, refunded: false },
      { id: "order:2", itemSubtotalUsd: 50, refunded: true },
    ];
    expect(aggregateShowSaleContributions(rows)).toEqual({
      grossShowSalesCents: 15_000,
      refundedShowSalesCents: 5000,
      netShowSalesCents: 10_000,
      paidOrderCount: 2,
    });
  });

  it("excludes marketplace/other-show rows by omission from contributions", () => {
    // Aggregation only sums provided contributions — callers must not pass unrelated orders.
    const showOnly: LiveShowSaleContribution[] = [
      { id: "order:show", itemSubtotalUsd: 20, refunded: false },
    ];
    expect(aggregateShowSaleContributions(showOnly).grossShowSalesCents).toBe(2000);
  });
});

describe("buildLiveShowSellerSummaryDTO", () => {
  it("builds show sales + current fee tier from fee GMV (per-sale rule)", () => {
    const dto = buildLiveShowSellerSummaryDTO({
      showId: "room_1",
      status: "live",
      contributions: [{ id: "order:1", itemSubtotalUsd: 468, refunded: false }],
      feeTierGmvUsd: 468,
      calculatedAt: new Date("2026-07-19T12:00:00.000Z"),
    });
    expect(dto.grossShowSalesCents).toBe(46_800);
    expect(dto.paidOrderCount).toBe(1);
    expect(dto.currentFeeRatePercent).toBe(LIVE_SHOW_TIER_1_FEE_PERCENT);
    expect(dto.currentFeeRateBps).toBe(800);
    expect(dto.nextTierRateBps).toBe(feePercentToBps(LIVE_SHOW_TIER_2_FEE_PERCENT));
    expect(dto.nextTierThresholdCents).toBe(usdToCents(LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD));
    expect(dto.amountUntilNextTierCents).toBe(usdToCents(LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD - 468));
    expect(dto.tierProgressPercent).toBeCloseTo((468 / LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD) * 100, 5);
    expect(dto.currency).toBe("usd");
  });

  it("uses fee-tier GMV for progress even when gross includes refunds", () => {
    const dto = buildLiveShowSellerSummaryDTO({
      showId: "room_1",
      status: "live",
      contributions: [
        { id: "order:1", itemSubtotalUsd: 1000, refunded: false },
        { id: "order:2", itemSubtotalUsd: 200, refunded: true },
      ],
      // Fee counter reverses refunds mid-show (existing business rule).
      feeTierGmvUsd: 1000,
    });
    expect(dto.grossShowSalesCents).toBe(120_000);
    expect(dto.netShowSalesCents).toBe(100_000);
    expect(dto.feeTierGmvCents).toBe(100_000);
    expect(dto.currentFeeRatePercent).toBe(LIVE_SHOW_TIER_2_FEE_PERCENT);
  });

  it("unlocks top tier at exact $3000 boundary", () => {
    const dto = buildLiveShowSellerSummaryDTO({
      showId: "room_1",
      status: "ended",
      contributions: [{ id: "order:1", itemSubtotalUsd: LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD, refunded: false }],
      feeTierGmvUsd: LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD,
    });
    expect(dto.currentFeeRatePercent).toBe(LIVE_SHOW_TIER_3_FEE_PERCENT);
    expect(dto.nextTierRateBps).toBeNull();
    expect(dto.amountUntilNextTierCents).toBeNull();
    expect(dto.tierProgressPercent).toBe(100);
  });

  it("preserves final totals after show ends via contributions + fee snapshot GMV", () => {
    const dto = buildLiveShowSellerSummaryDTO({
      showId: "room_1",
      status: "ended",
      contributions: [
        { id: "order:1", itemSubtotalUsd: 800, refunded: false },
        { id: "order:2", itemSubtotalUsd: 450, refunded: false },
      ],
      feeTierGmvUsd: 1250,
    });
    expect(dto.status).toBe("ended");
    expect(dto.grossShowSalesCents).toBe(125_000);
    expect(dto.feeTierGmvCents).toBe(125_000);
  });
});

describe("tierProgressPercent", () => {
  it("is correct at boundaries", () => {
    expect(tierProgressPercent(0, 1000)).toBe(0);
    expect(tierProgressPercent(500, 1000)).toBe(50);
    expect(tierProgressPercent(1000, 1000)).toBe(100);
    expect(tierProgressPercent(1500, 1000)).toBe(100);
    expect(tierProgressPercent(5000, null)).toBe(100);
  });
});
