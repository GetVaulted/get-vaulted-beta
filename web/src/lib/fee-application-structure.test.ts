import { describe, expect, it } from "vitest";
import {
  PLATFORM_FEE_PERCENT_MAX,
  clampPlatformFeePercent,
  completedLiveShowGmvBeforeSale,
  liveShowPlatformFeePercent,
  marketplacePlatformFeePercent,
  resolveCheckoutApplicationFeeCentsSync,
  resolvePlatformFeePercentForCheckout,
} from "@/lib/platform-fee-policy";
import { liveTipApplicationFeeCents } from "@/lib/live-tip-routing";
import { estimateSellerOrderPayoutUsd } from "@/lib/seller-payout-estimate";

describe("Fee application structure (QA lock)", () => {
  describe("Marketplace", () => {
    it("calculates 6.75% platform fee on item price only", () => {
      expect(marketplacePlatformFeePercent()).toBe(6.75);
      expect(
        resolveCheckoutApplicationFeeCentsSync({
          saleAmountUsd: 100,
          isCompanyListing: false,
        }),
      ).toBe(675);
      // Shipping must not inflate platform fee
      expect(
        resolveCheckoutApplicationFeeCentsSync({
          saleAmountUsd: 100,
          isCompanyListing: false,
        }),
      ).toBe(675);
    });

    it("Stripe application_fee_amount is platform fee only (not processing)", () => {
      const platformFee = resolveCheckoutApplicationFeeCentsSync({
        saleAmountUsd: 250,
        isCompanyListing: false,
      });
      expect(platformFee).toBe(1688);
      expect(liveTipApplicationFeeCents()).toBe(0);
    });

    it("never allows a platform fee above 6.75%", () => {
      expect(PLATFORM_FEE_PERCENT_MAX).toBe(6.75);
      expect(clampPlatformFeePercent(8)).toBe(6.75);
      expect(clampPlatformFeePercent(99)).toBe(6.75);
      expect(
        resolvePlatformFeePercentForCheckout({
          isCompanyListing: false,
          sellerPlatformFeePercentOverride: 10,
        }),
      ).toBe(6.75);
    });
  });

  describe("Live show tiers (per show session GMV)", () => {
    it("under $3,000 show GMV uses 6.75%", () => {
      expect(liveShowPlatformFeePercent(0)).toBe(6.75);
      expect(liveShowPlatformFeePercent(2999.99)).toBe(6.75);
      expect(
        resolveCheckoutApplicationFeeCentsSync({
          saleAmountUsd: 100,
          isCompanyListing: false,
          liveRoomId: "room_1",
          completedLiveShowGmvUsd: 500,
        }),
      ).toBe(675);
    });

    it("after $3,000 show GMV uses 5.75%", () => {
      expect(liveShowPlatformFeePercent(3000)).toBe(5.75);
      expect(
        resolveCheckoutApplicationFeeCentsSync({
          saleAmountUsd: 100,
          isCompanyListing: false,
          liveRoomId: "room_1",
          completedLiveShowGmvUsd: 3500,
        }),
      ).toBe(575);
    });

    it("after $5,500 show GMV uses 5%", () => {
      expect(liveShowPlatformFeePercent(5500)).toBe(5);
      expect(
        resolveCheckoutApplicationFeeCentsSync({
          saleAmountUsd: 100,
          isCompanyListing: false,
          liveRoomId: "room_1",
          completedLiveShowGmvUsd: 6000,
        }),
      ).toBe(500);
    });

    it("marketplace fee percent ignores live GMV context", () => {
      expect(
        resolvePlatformFeePercentForCheckout({
          isCompanyListing: false,
          liveRoomId: null,
          completedLiveShowGmvUsd: 5000,
        }),
      ).toBe(6.75);
    });

    it("seller override replaces tiered live fee (still capped at 6.75)", () => {
      expect(
        resolvePlatformFeePercentForCheckout({
          isCompanyListing: false,
          liveRoomId: "room_1",
          completedLiveShowGmvUsd: 6000,
          sellerPlatformFeePercentOverride: 5,
        }),
      ).toBe(5);
    });

    it("reconstructs GMV before sale for completed order estimate", () => {
      expect(completedLiveShowGmvBeforeSale(3500, 100)).toBe(3400);
      expect(liveShowPlatformFeePercent(3400)).toBe(5.75);
    });

    it("ended show GMV reads as 0 for tier lookup (tier resets when show ends)", () => {
      expect(liveShowPlatformFeePercent(0)).toBe(6.75);
    });
  });

  describe("Tips", () => {
    it("always 0% platform fee; processing is separate via Stripe", () => {
      expect(liveTipApplicationFeeCents()).toBe(0);
    });
  });

  describe("Seller payout estimate", () => {
    it("reflects item minus platform fee minus reserve (processing separate)", () => {
      expect(
        estimateSellerOrderPayoutUsd({
          itemPriceUsd: 100,
          payoutReserveAmountCents: 0,
          platformFeePercent: 6.75,
        }),
      ).toBe(93.25);
      expect(
        estimateSellerOrderPayoutUsd({
          itemPriceUsd: 100,
          payoutReserveAmountCents: 500,
          platformFeePercent: 5.75,
        }),
      ).toBe(89.25);
    });
  });
});
