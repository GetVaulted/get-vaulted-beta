import { describe, expect, it } from "vitest";
import {
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
    it("calculates 8% platform fee on item price only", () => {
      expect(marketplacePlatformFeePercent()).toBe(8);
      expect(
        resolveCheckoutApplicationFeeCentsSync({
          saleAmountUsd: 100,
          isCompanyListing: false,
        }),
      ).toBe(800);
      // Shipping must not inflate platform fee
      expect(
        resolveCheckoutApplicationFeeCentsSync({
          saleAmountUsd: 100,
          isCompanyListing: false,
        }),
      ).toBe(800);
    });

    it("Stripe application_fee_amount is platform fee only (not processing)", () => {
      const platformFee = resolveCheckoutApplicationFeeCentsSync({
        saleAmountUsd: 250,
        isCompanyListing: false,
      });
      expect(platformFee).toBe(2000);
      expect(liveTipApplicationFeeCents()).toBe(0);
    });
  });

  describe("Live show tiers (per show session GMV)", () => {
    it("under $1,000 show GMV uses 8%", () => {
      expect(liveShowPlatformFeePercent(0)).toBe(8);
      expect(liveShowPlatformFeePercent(999.99)).toBe(8);
      expect(
        resolveCheckoutApplicationFeeCentsSync({
          saleAmountUsd: 100,
          isCompanyListing: false,
          liveRoomId: "room_1",
          completedLiveShowGmvUsd: 500,
        }),
      ).toBe(800);
    });

    it("after $1,000 show GMV uses 7.25%", () => {
      expect(liveShowPlatformFeePercent(1000)).toBe(7.25);
      expect(
        resolveCheckoutApplicationFeeCentsSync({
          saleAmountUsd: 100,
          isCompanyListing: false,
          liveRoomId: "room_1",
          completedLiveShowGmvUsd: 1500,
        }),
      ).toBe(725);
    });

    it("after $3,000 show GMV uses 6.5%", () => {
      expect(liveShowPlatformFeePercent(3000)).toBe(6.5);
      expect(
        resolveCheckoutApplicationFeeCentsSync({
          saleAmountUsd: 100,
          isCompanyListing: false,
          liveRoomId: "room_1",
          completedLiveShowGmvUsd: 4000,
        }),
      ).toBe(650);
    });

    it("marketplace fee percent ignores live GMV context", () => {
      expect(
        resolvePlatformFeePercentForCheckout({
          isCompanyListing: false,
          liveRoomId: null,
          completedLiveShowGmvUsd: 5000,
        }),
      ).toBe(8);
    });

    it("seller override replaces tiered live fee", () => {
      expect(
        resolvePlatformFeePercentForCheckout({
          isCompanyListing: false,
          liveRoomId: "room_1",
          completedLiveShowGmvUsd: 4000,
          sellerPlatformFeePercentOverride: 5,
        }),
      ).toBe(5);
    });

    it("reconstructs GMV before sale for completed order estimate", () => {
      expect(completedLiveShowGmvBeforeSale(1500, 100)).toBe(1400);
      expect(liveShowPlatformFeePercent(1400)).toBe(7.25);
    });

    it("ended show GMV reads as 0 for tier lookup (tier resets when show ends)", () => {
      expect(liveShowPlatformFeePercent(0)).toBe(8);
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
          platformFeePercent: 8,
        }),
      ).toBe(92);
      expect(
        estimateSellerOrderPayoutUsd({
          itemPriceUsd: 100,
          payoutReserveAmountCents: 500,
          platformFeePercent: 7.25,
        }),
      ).toBe(87.75);
    });
  });
});
