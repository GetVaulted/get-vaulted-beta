import { describe, expect, it } from "vitest";
import {
  estimateSellerOrderPayoutUsd,
  estimateStripeProcessingFeeCents,
  estimateStripeProcessingFeeUsd,
  resolvePlatformFeePercentForSellerOrder,
  resolveSellerAbsorbedProcessingFeeUsd,
} from "@/lib/seller-payout-estimate";

describe("seller-payout-estimate", () => {
  it("estimates net payout after platform fee and reserve", () => {
    expect(
      estimateSellerOrderPayoutUsd({
        itemPriceUsd: 100,
        payoutReserveAmountCents: 500,
        platformFeePercent: 8,
      }),
    ).toBe(87);
  });

  it("includes shipping pass-through in estimate before a Get Vaulted label", () => {
    expect(
      estimateSellerOrderPayoutUsd({
        itemPriceUsd: 100,
        shippingPriceUsd: 5,
        payoutReserveAmountCents: 0,
        platformFeePercent: 8,
      }),
    ).toBe(97);
  });

  it("subtracts Get Vaulted label cost from payout estimate when labeled", () => {
    expect(
      estimateSellerOrderPayoutUsd({
        itemPriceUsd: 100,
        shippingPriceUsd: 5.48,
        payoutReserveAmountCents: 0,
        platformFeePercent: 8,
        shippingLabelCostCents: 548,
      }),
    ).toBe(92);
    expect(
      estimateSellerOrderPayoutUsd({
        itemPriceUsd: 1.99,
        shippingPriceUsd: 5.48,
        payoutReserveAmountCents: 0,
        platformFeePercent: 8,
        shippingLabelCostReversedCents: 548,
      }),
    ).toBe(1.83);
  });

  it("prefers cumulative reversed cents over latest label cost", () => {
    expect(
      estimateSellerOrderPayoutUsd({
        itemPriceUsd: 100,
        shippingPriceUsd: 10,
        payoutReserveAmountCents: 0,
        platformFeePercent: 8,
        shippingLabelCostCents: 500,
        shippingLabelCostReversedCents: 1100,
      }),
    ).toBe(91);
  });

  it("estimates Stripe processing fee on buyer charge total", () => {
    expect(estimateStripeProcessingFeeUsd(100)).toBe(3.2);
    expect(estimateStripeProcessingFeeUsd(0)).toBe(0.3);
  });

  it("estimates Stripe processing fee in cents (2.9% + $0.30)", () => {
    expect(estimateStripeProcessingFeeCents(10000)).toBe(320);
    expect(estimateStripeProcessingFeeCents(0)).toBe(0);
  });

  it("subtracts the seller-absorbed Stripe processing fee from the payout estimate", () => {
    const base = estimateSellerOrderPayoutUsd({
      itemPriceUsd: 100,
      payoutReserveAmountCents: 0,
      platformFeePercent: 8,
    });
    const withProcessing = estimateSellerOrderPayoutUsd({
      itemPriceUsd: 100,
      payoutReserveAmountCents: 0,
      platformFeePercent: 8,
      stripeProcessingFeeUsd: 3.2,
    });
    expect(base).toBe(92);
    expect(withProcessing).toBe(88.8);
  });

  it("resolveSellerAbsorbedProcessingFeeUsd: company never invents a processing haircut", () => {
    expect(
      resolveSellerAbsorbedProcessingFeeUsd({
        isCompanyListing: true,
        stripeProcessingFeeCents: null,
        buyerChargeTotalUsd: 100,
      }),
    ).toBe(0);
    expect(
      resolveSellerAbsorbedProcessingFeeUsd({
        isCompanyListing: true,
        stripeProcessingFeeCents: 0,
        buyerChargeTotalUsd: 100,
      }),
    ).toBe(0);
  });

  it("resolveSellerAbsorbedProcessingFeeUsd: marketplace prefers stored cents then estimate", () => {
    expect(
      resolveSellerAbsorbedProcessingFeeUsd({
        isCompanyListing: false,
        stripeProcessingFeeCents: 250,
        buyerChargeTotalUsd: 100,
      }),
    ).toBe(2.5);
    expect(
      resolveSellerAbsorbedProcessingFeeUsd({
        isCompanyListing: false,
        stripeProcessingFeeCents: null,
        buyerChargeTotalUsd: 100,
      }),
    ).toBe(3.2);
  });

  it("uses live tier percent for live show orders", () => {
    const pct = resolvePlatformFeePercentForSellerOrder({
      isCompanyListing: false,
      liveShowId: "room_1",
      liveShowCompletedGmvUsd: 3500,
      orderItemPriceUsd: 50,
      orderPaymentStatus: "paid",
    });
    expect(pct).toBe(5.75);
  });
});
