import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/platform-fee-settings", () => ({
  getCachedMarketplacePlatformFeePercent: () => 8,
}));

vi.mock("@/services/live-show-fee-settings", () => ({
  getCachedLiveShowFeeConfig: () => ({
    tier1FeePercent: 8,
    tier2FeePercent: 7.25,
    tier3FeePercent: 6.5,
    tier2ThresholdUsd: 1000,
    tier3ThresholdUsd: 3000,
  }),
}));

import {
  computeOffPlatformPlatformFee,
  normalizeOffPlatformSaleAmountUsd,
  parseOffPlatformSettlementMethod,
  parseOffPlatformZeroReason,
} from "@/lib/off-platform-settlement";

describe("off-platform settlement", () => {
  it("parses settlement methods and zero reasons", () => {
    expect(parseOffPlatformSettlementMethod("Venmo")).toBe("venmo");
    expect(parseOffPlatformSettlementMethod("nope")).toBeNull();
    expect(parseOffPlatformZeroReason("giveaway")).toBe("giveaway");
    expect(parseOffPlatformZeroReason("")).toBeNull();
  });

  it("normalizes sale amounts", () => {
    expect(normalizeOffPlatformSaleAmountUsd(12.345)).toBe(12.35);
    expect(normalizeOffPlatformSaleAmountUsd(-1)).toBeNull();
    expect(normalizeOffPlatformSaleAmountUsd("10")).toBeNull();
  });

  it("waives fee for $0 sales and charges live tier fee otherwise", () => {
    expect(
      computeOffPlatformPlatformFee({
        saleAmountUsd: 0,
        liveShowId: "room_1",
        liveShowCompletedGmvUsd: 0,
      }),
    ).toEqual({ feePercent: 0, feeCents: 0, feeStatus: "waived" });

    const paid = computeOffPlatformPlatformFee({
      saleAmountUsd: 100,
      liveShowId: "room_1",
      liveShowCompletedGmvUsd: 0,
    });
    expect(paid.feeStatus).toBe("unpaid");
    expect(paid.feePercent).toBe(8);
    expect(paid.feeCents).toBe(800);
  });
});
