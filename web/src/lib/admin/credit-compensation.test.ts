import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/seller-payout-estimate", () => ({
  // 2.9% + 30 cents, like Stripe's standard card rate.
  estimateStripeProcessingFeeCents: (cents: number) => Math.round(cents * 0.029 + 30),
}));

import { creditCompensationStatus, estimateCreditShortfallCents } from "@/lib/admin/credit-compensation";

describe("estimateCreditShortfallCents", () => {
  it("is zero when no credit was applied", () => {
    expect(
      estimateCreditShortfallCents({ itemPriceUsd: 20, shippingPriceUsd: 3.33, platformFeeCents: 200 }),
    ).toBe(0);
  });

  it("is zero when the platform fee and processing cover the credit", () => {
    expect(
      estimateCreditShortfallCents({
        platformCreditAppliedUsd: 1,
        itemPriceUsd: 20,
        shippingPriceUsd: 3.33,
        platformFeeCents: 200,
      }),
    ).toBe(0);
  });

  it("is credit minus fee minus processing when credit is larger", () => {
    // charge = 0.50 + 0 + 0.04 = $0.54 -> processing = round(54 * 0.029 + 30) = 32
    // shortfall = 950 - 68 - 32 = 850
    expect(
      estimateCreditShortfallCents({
        platformCreditAppliedUsd: 9.5,
        itemPriceUsd: 0.5,
        shippingPriceUsd: 0,
        taxUsd: 0.04,
        platformFeeCents: 68,
      }),
    ).toBe(850);
  });

  it("adds platform and referral credit together", () => {
    const both = estimateCreditShortfallCents({
      platformCreditAppliedUsd: 5,
      referralCreditAppliedUsd: 5,
      itemPriceUsd: 5,
      shippingPriceUsd: 0,
      platformFeeCents: 0,
    });
    // fee is 0 so processing is not subtracted: the full $10 is short.
    expect(both).toBe(1000);
  });
});

describe("creditCompensationStatus", () => {
  const base = {
    shortfallEstimateCents: 850,
    fundedAt: null,
    failedAt: null,
    sellerPayoutProcessor: "STRIPE",
    paymentMethod: "card",
  };

  it("owed when there is a gap and nothing is recorded", () => {
    expect(creditCompensationStatus(base)).toBe("owed");
  });

  it("compensated once a top-up is recorded, even if an earlier attempt failed", () => {
    expect(creditCompensationStatus({ ...base, fundedAt: new Date(), failedAt: new Date() })).toBe("compensated");
  });

  it("failed when the automatic top-up failed and nothing was recorded after", () => {
    expect(creditCompensationStatus({ ...base, failedAt: new Date() })).toBe("failed");
  });

  it("fee_covers when the fee absorbed the credit", () => {
    expect(creditCompensationStatus({ ...base, shortfallEstimateCents: 0 })).toBe("fee_covers");
  });

  it("not_applicable for PayPal and escrow orders", () => {
    expect(creditCompensationStatus({ ...base, sellerPayoutProcessor: "PAYPAL" })).toBe("not_applicable");
    expect(creditCompensationStatus({ ...base, paymentMethod: "escrow" })).toBe("not_applicable");
  });
});
