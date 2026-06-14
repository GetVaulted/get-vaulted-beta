import { describe, expect, it } from "vitest";
import {
  estimateSellerOrderPayoutUsd,
  estimateStripeProcessingFeeUsd,
  resolvePlatformFeePercentForSellerOrder,
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

  it("includes shipping pass-through in estimate", () => {
    expect(
      estimateSellerOrderPayoutUsd({
        itemPriceUsd: 100,
        shippingPriceUsd: 5,
        payoutReserveAmountCents: 0,
        platformFeePercent: 8,
      }),
    ).toBe(97);
  });

  it("estimates Stripe processing fee on buyer charge total", () => {
    expect(estimateStripeProcessingFeeUsd(100)).toBe(3.2);
    expect(estimateStripeProcessingFeeUsd(0)).toBe(0.3);
  });

  it("uses live tier percent for live show orders", () => {
    const pct = resolvePlatformFeePercentForSellerOrder({
      isCompanyListing: false,
      liveShowId: "room_1",
      liveShowCompletedGmvUsd: 1500,
      orderItemPriceUsd: 50,
      orderPaymentStatus: "paid",
    });
    expect(pct).toBe(7.25);
  });
});
