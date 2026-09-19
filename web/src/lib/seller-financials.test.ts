import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  orderFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: hoisted.userFindUnique },
    order: { findMany: hoisted.orderFindMany },
  },
}));

vi.mock("@/lib/seller-platform-fee-override-user", () => ({
  sellerPlatformFeeOverrideSelect: {},
  sellerUserWithEffectivePlatformFeeOverride: (u: { sellerPlatformFeePercentOverride?: number | null }) => u,
}));

vi.mock("@/lib/live-show-gmv", () => ({
  liveShowGmvForFeeTierReconstruction: () => 0,
}));

vi.mock("@/lib/seller-payout-estimate", () => ({
  resolvePlatformFeePercentForSellerOrder: () => 10,
  estimatePlatformFeeUsd: ({ itemPriceUsd, platformFeePercent }: { itemPriceUsd: number; platformFeePercent: number }) =>
    (itemPriceUsd * platformFeePercent) / 100,
  estimateStripeProcessingFeeUsd: (total: number) => Math.round((total * 0.029 + 0.3) * 100) / 100,
  estimateSellerOrderPayoutUsd: (args: {
    itemPriceUsd: number;
    shippingPriceUsd?: number;
    payoutReserveAmountCents: number;
    platformFeePercent?: number;
    shippingLabelCostCents?: number | null;
    stripeProcessingFeeUsd?: number;
  }) => {
    const fee = (args.itemPriceUsd * (args.platformFeePercent ?? 10)) / 100;
    const reserve = args.payoutReserveAmountCents / 100;
    const label = (args.shippingLabelCostCents ?? 0) / 100;
    const processing = args.stripeProcessingFeeUsd ?? 0;
    const shipping = args.shippingPriceUsd ?? 0;
    return Math.max(0, Math.round((args.itemPriceUsd - fee - reserve + shipping - label - processing) * 100) / 100);
  },
}));

vi.mock("@/services/live-show-fee-settings", () => ({
  ensureLiveShowFeeCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/platform-fee-settings", () => ({
  ensureMarketplacePlatformFeeCache: vi.fn().mockResolvedValue(undefined),
}));

import { buildSellerFinancialsSummary, payoutStatusLabel } from "./seller-financials";

describe("payoutStatusLabel", () => {
  it("labels known statuses", () => {
    expect(payoutStatusLabel("paid_out")).toBe("Paid out");
    expect(payoutStatusLabel("instant_payout_ready")).toBe("Instant payout ready");
  });
});

describe("buildSellerFinancialsSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.userFindUnique.mockResolvedValue({
      payoutTier: "standard",
      sellerPlatformFeePercentOverride: null,
      payoutMetrics: { lifetimeGmvUsd: 999 },
    });
  });

  it("aggregates GMV, nets, fees, and payout buckets across marketplace and live", async () => {
    hoisted.orderFindMany.mockResolvedValue([
      {
        id: "m1",
        totalUsd: 113,
        itemPriceUsd: 100,
        shippingPriceUsd: 5,
        taxUsd: 8,
        taxAmountCents: 800,
        paymentStatus: "paid",
        payoutStatus: "paid_out",
        payoutReserveAmountCents: 0,
        shippingLabelCostCents: 400,
        shippingLabelCostReversedCents: null,
        stripeApplicationFeeCents: null,
        stripeProcessingFeeCents: null,
        createdAt: new Date("2026-07-18T15:00:00.000Z"),
        listing: { title: "Market card", isCompanyListing: false },
        buyer: { username: "buyer_a" },
        liveShippingSession: null,
      },
      {
        id: "l1",
        totalUsd: 55,
        itemPriceUsd: 50,
        shippingPriceUsd: 5,
        taxUsd: 0,
        taxAmountCents: 0,
        paymentStatus: "paid",
        payoutStatus: "pending",
        payoutReserveAmountCents: 0,
        shippingChargedCents: 500,
        shippingLabelCostCents: null,
        shippingLabelCostReversedCents: null,
        // Inflated Stripe application fee (platform + processing) — must NOT drive Get Vaulted fee.
        stripeApplicationFeeCents: 690,
        // Persisted platform fee snapshot at charge time (10% of $50).
        platformFeeCents: 500,
        platformFeePercentApplied: 10,
        platformFeeBasisCents: 5000,
        stripeProcessingFeeCents: 190,
        carrier: null,
        service: null,
        trackingNumber: null,
        labelUrl: null,
        shippoTransactionId: null,
        labelCreatedAt: null,
        labelFinances: [],
        createdAt: new Date("2026-07-18T16:00:00.000Z"),
        listing: { title: "Live spot", isCompanyListing: false },
        buyer: { username: "buyer_b" },
        liveShippingSession: {
          liveShowId: "show_1",
          liveShow: {
            title: "Friday Break",
            completedSalesGmvUsd: 200,
            finalSalesGmvUsd: null,
            status: "live",
          },
        },
      },
      {
        id: "b1",
        totalUsd: 20,
        itemPriceUsd: 20,
        shippingPriceUsd: 0,
        taxUsd: 0,
        taxAmountCents: 0,
        paymentStatus: "paid",
        payoutStatus: "blocked",
        payoutReserveAmountCents: 0,
        shippingLabelCostCents: null,
        shippingLabelCostReversedCents: null,
        stripeApplicationFeeCents: null,
        stripeProcessingFeeCents: null,
        createdAt: new Date("2026-07-10T12:00:00.000Z"),
        listing: { title: "Blocked sale", isCompanyListing: false },
        buyer: { username: "buyer_c" },
        liveShippingSession: null,
      },
    ]);

    const summary = await buildSellerFinancialsSummary(
      "seller_1",
      "UTC",
      new Date("2026-07-18T18:00:00.000Z"),
    );

    expect(summary.paidOrderCount).toBe(3);
    expect(summary.lifetimeGmvUsd).toBe(170);
    expect(summary.marketplaceEarningsUsd).toBeGreaterThan(0);
    expect(summary.liveEarningsUsd).toBeGreaterThan(0);
    expect(summary.paidOutUsd).toBeGreaterThan(0);
    expect(summary.pendingPayoutUsd).toBeGreaterThan(0);
    expect(summary.heldOrBlockedUsd).toBeGreaterThan(0);
    expect(summary.todayGmvUsd).toBe(150); // m1 + l1
    expect(summary.monthGmvUsd).toBe(170);
    expect(summary.payoutStatusBreakdown.some((b) => b.status === "paid_out")).toBe(true);
    expect(summary.activity.find((a) => a.id === "l1")?.channel).toBe("live");
    expect(summary.metricsLifetimeGmvUsd).toBe(999);
    // Live row uses persisted platform fee — ignores inflated stripeApplicationFeeCents (690).
    const live = summary.activity.find((a) => a.id === "l1");
    expect(live?.platformFeeUsd).toBe(5);
    expect(live?.platformFeePercent).toBe(10);
    expect(live?.stripeProcessingFeeUsd).toBe(1.9);
    expect(live?.feesAreEstimates).toBe(false);
  });
});
