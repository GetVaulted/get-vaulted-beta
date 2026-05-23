import { describe, expect, it } from "vitest";
import {
  applicationFeeCentsFromSubtotalUsd,
  buildLiveShowFeeTierSnapshot,
  liveShowApplicationFeeCents,
  liveShowPlatformFeePercent,
  marketplaceApplicationFeeCents,
  MARKETPLACE_PLATFORM_FEE_PERCENT,
} from "@/lib/platform-fee-policy";

describe("marketplaceApplicationFeeCents", () => {
  it("uses fixed 8% for normal listings", () => {
    expect(MARKETPLACE_PLATFORM_FEE_PERCENT).toBe(8);
    expect(marketplaceApplicationFeeCents(100, false)).toBe(800);
    expect(marketplaceApplicationFeeCents(77, false)).toBe(616);
  });

  it("returns 0 for company listings", () => {
    expect(marketplaceApplicationFeeCents(100, true)).toBe(0);
  });
});

describe("liveShowPlatformFeePercent", () => {
  it("tiers by completed show GMV", () => {
    expect(liveShowPlatformFeePercent(0)).toBe(8);
    expect(liveShowPlatformFeePercent(999.99)).toBe(8);
    expect(liveShowPlatformFeePercent(1000)).toBe(7.25);
    expect(liveShowPlatformFeePercent(2999)).toBe(7.25);
    expect(liveShowPlatformFeePercent(3000)).toBe(6.5);
    expect(liveShowPlatformFeePercent(10000)).toBe(6.5);
  });
});

describe("liveShowApplicationFeeCents", () => {
  it("applies tier percent to subtotal", () => {
    expect(liveShowApplicationFeeCents(100, 0)).toBe(800);
    expect(liveShowApplicationFeeCents(100, 1500)).toBe(725);
    expect(liveShowApplicationFeeCents(100, 4000)).toBe(650);
  });
});

describe("buildLiveShowFeeTierSnapshot", () => {
  it("shows distance to next tier", () => {
    const snap = buildLiveShowFeeTierSnapshot(468);
    expect(snap.currentFeePercent).toBe(8);
    expect(snap.usdToNextTier).toBe(532);
    expect(snap.nextTierFeePercent).toBe(7.25);
  });

  it("has no next tier at top volume", () => {
    const snap = buildLiveShowFeeTierSnapshot(5000);
    expect(snap.currentFeePercent).toBe(6.5);
    expect(snap.usdToNextTier).toBeNull();
  });
});

describe("applicationFeeCentsFromSubtotalUsd", () => {
  it("rounds to cents", () => {
    expect(applicationFeeCentsFromSubtotalUsd(10.55, 8)).toBe(84);
  });
});
