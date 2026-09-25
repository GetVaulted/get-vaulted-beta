import { describe, expect, it } from "vitest";
import {
  applicationFeeCentsFromSubtotalUsd,
  buildLiveShowFeeTierSnapshot,
  liveShowApplicationFeeCents,
  liveShowPlatformFeePercent,
  marketplaceApplicationFeeCents,
  MARKETPLACE_PLATFORM_FEE_PERCENT,
  PLATFORM_FEE_PERCENT_MAX,
  clampPlatformFeePercent,
} from "@/lib/platform-fee-policy";

describe("marketplaceApplicationFeeCents", () => {
  it("uses fixed 6.75% on item/sale amount only", () => {
    expect(MARKETPLACE_PLATFORM_FEE_PERCENT).toBe(6.75);
    expect(PLATFORM_FEE_PERCENT_MAX).toBe(6.75);
    expect(marketplaceApplicationFeeCents(100, false)).toBe(675);
    expect(marketplaceApplicationFeeCents(77, false)).toBe(520);
  });

  it("does not fee shipping pass-through amounts when passed as sale base", () => {
    expect(marketplaceApplicationFeeCents(100, false)).toBe(675);
    expect(marketplaceApplicationFeeCents(15, false)).toBe(101);
  });

  it("returns 0 for company listings", () => {
    expect(marketplaceApplicationFeeCents(100, true)).toBe(0);
  });

  it("clamps inflated percents to 6.75", () => {
    expect(clampPlatformFeePercent(8)).toBe(6.75);
    expect(clampPlatformFeePercent(25)).toBe(6.75);
  });
});

describe("liveShowPlatformFeePercent", () => {
  it("tiers by completed show GMV", () => {
    expect(liveShowPlatformFeePercent(0)).toBe(6.75);
    expect(liveShowPlatformFeePercent(2999.99)).toBe(6.75);
    expect(liveShowPlatformFeePercent(3000)).toBe(5.75);
    expect(liveShowPlatformFeePercent(5499)).toBe(5.75);
    expect(liveShowPlatformFeePercent(5500)).toBe(5);
    expect(liveShowPlatformFeePercent(10000)).toBe(5);
  });
});

describe("liveShowApplicationFeeCents", () => {
  it("applies tier percent to subtotal", () => {
    expect(liveShowApplicationFeeCents(100, 0)).toBe(675);
    expect(liveShowApplicationFeeCents(100, 3500)).toBe(575);
    expect(liveShowApplicationFeeCents(100, 6000)).toBe(500);
  });
});

describe("buildLiveShowFeeTierSnapshot", () => {
  it("shows distance to next tier", () => {
    const snap = buildLiveShowFeeTierSnapshot(468);
    expect(snap.currentFeePercent).toBe(6.75);
    expect(snap.usdToNextTier).toBe(3000 - 468);
    expect(snap.nextTierFeePercent).toBe(5.75);
  });

  it("has no next tier at top volume", () => {
    const snap = buildLiveShowFeeTierSnapshot(6000);
    expect(snap.currentFeePercent).toBe(5);
    expect(snap.usdToNextTier).toBeNull();
  });
});

describe("applicationFeeCentsFromSubtotalUsd", () => {
  it("rounds to cents", () => {
    expect(applicationFeeCentsFromSubtotalUsd(10.55, 6.75)).toBe(71);
  });
});
