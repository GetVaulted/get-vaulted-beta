import { describe, expect, it } from "vitest";
import { paypalRailSellerProcessingFeeUsd } from "@/lib/paypal-rail-processing-fee";

const seller = { isCompanyListing: false };

describe("paypalRailSellerProcessingFeeUsd", () => {
  it("estimates 2.9% + $0.30 of the buyer charge when no fee is recorded", () => {
    expect(paypalRailSellerProcessingFeeUsd({ listing: seller, totalUsd: 43.99 })).toBe(1.58);
    expect(paypalRailSellerProcessingFeeUsd({ listing: seller, totalUsd: 3 })).toBe(0.39);
  });

  it("uses the recorded Stripe fee when present", () => {
    expect(
      paypalRailSellerProcessingFeeUsd({ listing: seller, totalUsd: 43.99, stripeProcessingFeeCents: 150 }),
    ).toBe(1.5);
  });

  it("is zero for company/official listings", () => {
    expect(
      paypalRailSellerProcessingFeeUsd({ listing: { isCompanyListing: true }, totalUsd: 43.99 }),
    ).toBe(0);
  });

  it("is zero when there is no buyer charge and no recorded fee", () => {
    expect(paypalRailSellerProcessingFeeUsd({ listing: seller, totalUsd: null })).toBe(0);
    expect(paypalRailSellerProcessingFeeUsd({ listing: seller, totalUsd: 0 })).toBe(0);
  });
});
