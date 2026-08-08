import { describe, expect, it } from "vitest";
import {
  effectiveSellerPlatformFeePercentOverride,
  LAUNCH_PROMO_SELLER_FEE_OVERRIDE_LIMIT,
  sellerPlatformFeeOverrideIsActive,
} from "@/services/seller-platform-fee-override";
import {
  resolveCheckoutApplicationFeeCentsSync,
  resolvePlatformFeePercentForCheckout,
} from "@/lib/platform-fee-policy";

describe("seller platform fee override", () => {
  it("returns null when no override is set", () => {
    expect(
      effectiveSellerPlatformFeePercentOverride({
        percent: null,
        expiresAt: null,
      }),
    ).toBeNull();
  });

  it("clamps override percent to 0–6.75", () => {
    expect(
      effectiveSellerPlatformFeePercentOverride({
        percent: 4.5,
        expiresAt: null,
      }),
    ).toBe(4.5);
    expect(
      effectiveSellerPlatformFeePercentOverride({
        percent: 99,
        expiresAt: null,
      }),
    ).toBe(6.75);
  });

  it("ignores expired overrides", () => {
    expect(
      effectiveSellerPlatformFeePercentOverride({
        percent: 4,
        expiresAt: new Date("2026-01-01T00:00:00Z"),
        now: new Date("2026-06-01T00:00:00Z"),
      }),
    ).toBeNull();
  });

  it("applies override at checkout instead of live tier or marketplace default", () => {
    expect(
      resolvePlatformFeePercentForCheckout({
        isCompanyListing: false,
        liveRoomId: "room_1",
        completedLiveShowGmvUsd: 5000,
        sellerPlatformFeePercentOverride: 4,
      }),
    ).toBe(4);
    expect(
      resolveCheckoutApplicationFeeCentsSync({
        saleAmountUsd: 100,
        isCompanyListing: false,
        liveRoomId: "room_1",
        completedLiveShowGmvUsd: 5000,
        sellerPlatformFeePercentOverride: 4,
      }),
    ).toBe(400);
  });

  it("company listings stay at 0% even with override context", () => {
    expect(
      resolvePlatformFeePercentForCheckout({
        isCompanyListing: true,
        sellerPlatformFeePercentOverride: 4,
      }),
    ).toBe(0);
  });

  it("tracks active override eligibility for launch promo cap", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(
      sellerPlatformFeeOverrideIsActive({
        percent: 4,
        expiresAt: new Date("2026-12-01T00:00:00Z"),
        now,
      }),
    ).toBe(true);
    expect(
      sellerPlatformFeeOverrideIsActive({
        percent: 4,
        expiresAt: new Date("2026-01-01T00:00:00Z"),
        now,
      }),
    ).toBe(false);
    expect(LAUNCH_PROMO_SELLER_FEE_OVERRIDE_LIMIT).toBe(20);
  });
});
