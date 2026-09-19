import { describe, expect, it } from "vitest";
import { resolveSellerPlatformFeeDisplay } from "@/lib/seller-platform-fee-display";
import { applicationFeeCentsFromSubtotalUsd } from "@/lib/platform-fee-policy";

describe("resolveSellerPlatformFeeDisplay", () => {
  it("base-tier $100 sale displays Get Vaulted fee $6.75 and 6.75% from persisted snapshot", () => {
    const fee = resolveSellerPlatformFeeDisplay({
      itemPriceUsd: 100,
      isCompanyListing: false,
      platformFeeCents: 675,
      platformFeePercentApplied: 6.75,
      platformFeeBasisCents: 10000,
    });
    expect(fee.platformFeeUsd).toBe(6.75);
    expect(fee.platformFeeCents).toBe(675);
    expect(fee.platformFeePercent).toBe(6.75);
    expect(fee.effectivePercent).toBe(6.75);
    expect(fee.source).toBe("persisted");
  });

  it("processing does not change the Get Vaulted fee line", () => {
    const fee = resolveSellerPlatformFeeDisplay({
      itemPriceUsd: 100,
      isCompanyListing: false,
      platformFeeCents: 675,
      platformFeePercentApplied: 6.75,
      platformFeeBasisCents: 10000,
    });
    // Caller may have stripeApplicationFeeCents = 675 + processing — we never accept it here.
    expect(fee.platformFeeCents).toBe(675);
    expect(fee.platformFeeUsd).toBe(6.75);
  });

  it("shipping and tax are not in the fee basis when persisted", () => {
    const fee = resolveSellerPlatformFeeDisplay({
      itemPriceUsd: 100,
      isCompanyListing: false,
      platformFeeCents: 675,
      platformFeePercentApplied: 6.75,
      platformFeeBasisCents: 10000,
    });
    expect(fee.platformFeeBasisCents).toBe(10000);
    expect(fee.platformFeeCents).toBe(applicationFeeCentsFromSubtotalUsd(100, 6.75));
  });

  it("historical 8% order continues to display 8% when 8% was persisted", () => {
    const fee = resolveSellerPlatformFeeDisplay({
      itemPriceUsd: 100,
      isCompanyListing: false,
      platformFeeCents: 800,
      platformFeePercentApplied: 8,
      platformFeeBasisCents: 10000,
    });
    expect(fee.platformFeePercent).toBe(8);
    expect(fee.platformFeeUsd).toBe(8);
    expect(fee.effectivePercent).toBe(8);
    expect(fee.source).toBe("persisted");
  });

  it("current 6.75% config is not retroactively applied when 8% was persisted", () => {
    const fee = resolveSellerPlatformFeeDisplay({
      itemPriceUsd: 100,
      isCompanyListing: false,
      platformFeeCents: 800,
      platformFeePercentApplied: 8,
      platformFeeBasisCents: 10000,
      // Reconstruction would use live show + override — ignored when persisted.
      liveShowId: "show",
      liveShowCompletedGmvUsd: 0,
      orderPaymentStatus: "paid",
      sellerPlatformFeePercentOverride: 6.75,
    });
    expect(fee.platformFeePercent).toBe(8);
    expect(fee.platformFeeUsd).toBe(8);
  });

  it("wrong denominator cannot make 6.75% appear as 7%+ when persisted", () => {
    const fee = resolveSellerPlatformFeeDisplay({
      itemPriceUsd: 33,
      isCompanyListing: false,
      platformFeeCents: 223,
      platformFeePercentApplied: 6.75,
      platformFeeBasisCents: 3300,
    });
    // 223/3300 ≈ 6.757% — not 7.25%. UI must use basis, not buyer total or payout.
    expect(fee.effectivePercent).toBeCloseTo(6.757, 2);
    expect(fee.effectivePercent).toBeLessThan(7);
    expect(fee.platformFeePercent).toBe(6.75);
  });

  it("persisted platformFeeCents and basis drive the UI", () => {
    const fee = resolveSellerPlatformFeeDisplay({
      itemPriceUsd: 999, // misleading item — ignored when persisted
      isCompanyListing: false,
      platformFeeCents: 116,
      platformFeePercentApplied: 7.25,
      platformFeeBasisCents: 1600,
    });
    expect(fee.platformFeeCents).toBe(116);
    expect(fee.platformFeeBasisCents).toBe(1600);
    expect(fee.platformFeeUsd).toBe(1.16);
  });
});
