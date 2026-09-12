import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePlatformFeePercentForSellerOrder } from "@/lib/seller-payout-estimate";

const prismaMock = vi.hoisted(() => ({
  order: { findMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
  layaway: { count: vi.fn().mockResolvedValue(0) },
  sellerPayoutMetrics: { aggregate: vi.fn().mockResolvedValue({ _sum: { unresolvedDisputeCount: 0 } }) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/services/platform-fee-settings", () => ({
  ensureMarketplacePlatformFeeCache: vi.fn(),
  getCachedMarketplacePlatformFeePercent: () => 6.75,
}));
vi.mock("@/services/live-show-fee-settings", () => ({
  ensureLiveShowFeeCache: vi.fn(),
  getCachedLiveShowFeeConfig: () => ({
    tier1FeePercent: 6.75,
    tier2ThresholdUsd: 3000,
    tier2FeePercent: 5.75,
    tier3ThresholdUsd: 5500,
    tier3FeePercent: 5,
  }),
}));

import { loadAdminFinanceSummary } from "@/lib/admin/admin-finance-aggregates";

describe("loadAdminFinanceSummary fee-tier consistency with seller reports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the live-show tiered fee percent for live orders instead of the flat marketplace percent", async () => {
    // Show has already completed $3,500 in GMV (past the tier-2 threshold), so per
    // `resolvePlatformFeePercentForSellerOrder` this $100 sale should fee at 5.75%,
    // NOT the flat 6.75% marketplace rate.
    const liveOrder = {
      itemPriceUsd: 100,
      totalUsd: 105,
      paymentStatus: "paid",
      payoutStatus: "held",
      payoutReserveAmountCents: 0,
      listing: { isCompanyListing: false },
      liveShippingSession: {
        liveShowId: "room_1",
        liveShow: { completedSalesGmvUsd: 3500, status: "live" },
      },
    };
    prismaMock.order.findMany.mockResolvedValue([liveOrder]);

    const summary = await loadAdminFinanceSummary();

    const expectedPct = resolvePlatformFeePercentForSellerOrder({
      isCompanyListing: false,
      liveShowId: "room_1",
      liveShowCompletedGmvUsd: 3500,
      orderItemPriceUsd: 100,
      orderPaymentStatus: "paid",
    });
    expect(expectedPct).not.toBe(6.75);
    expect(expectedPct).toBe(5.75);

    const expectedFeeUsd = Math.round(((100 * expectedPct) / 100) * 100) / 100;
    expect(summary.platformFeesUsd).toBe(expectedFeeUsd);
    expect(summary.platformFeesUsd).not.toBe(6.75);
  });

  it("applies the flat marketplace fee for non-live marketplace orders", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        itemPriceUsd: 100,
        totalUsd: 105,
        paymentStatus: "paid",
        payoutStatus: "held",
        payoutReserveAmountCents: 0,
        listing: { isCompanyListing: false },
        liveShippingSession: null,
      },
    ]);

    const summary = await loadAdminFinanceSummary();

    expect(summary.platformFeesUsd).toBe(6.75);
    expect(summary.gmvUsd).toBe(100);
  });

  it("charges zero platform fee for company listings", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        itemPriceUsd: 100,
        totalUsd: 105,
        paymentStatus: "paid",
        payoutStatus: "held",
        payoutReserveAmountCents: 0,
        listing: { isCompanyListing: true },
        liveShippingSession: null,
      },
    ]);

    const summary = await loadAdminFinanceSummary();

    expect(summary.platformFeesUsd).toBe(0);
  });

  it("includes shipping pass-through in pending seller payout before a label debit", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        itemPriceUsd: 100,
        shippingPriceUsd: 15,
        totalUsd: 123,
        paymentStatus: "paid",
        payoutStatus: "held",
        payoutReserveAmountCents: 0,
        shippingLabelCostCents: null,
        shippingLabelCostReversedCents: 0,
        listing: { isCompanyListing: false },
        liveShippingSession: null,
      },
    ]);

    const summary = await loadAdminFinanceSummary();

    // Seller net = item(100) - fee(6.75) + shipping(15) - processing(2.9%×123+$0.30)
    // processing = round(3.867*100)/100 = 3.87 → 100 - 6.75 + 15 - 3.87 = 104.38
    expect(summary.pendingPayoutsUsd).toBe(104.38);
  });

  it("subtracts Get Vaulted label cost from pending seller payout after debit", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        itemPriceUsd: 100,
        shippingPriceUsd: 15,
        totalUsd: 123,
        paymentStatus: "paid",
        payoutStatus: "held",
        payoutReserveAmountCents: 0,
        shippingLabelCostCents: 1500,
        shippingLabelCostReversedCents: 1500,
        listing: { isCompanyListing: false },
        liveShippingSession: null,
      },
    ]);

    const summary = await loadAdminFinanceSummary();
    // 104.38 - 15 label = 89.38
    expect(summary.pendingPayoutsUsd).toBe(89.38);
  });

  it("counts marketplace order refunds and chargebacks, not just layaway refunds", async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockImplementation(({ where }: { where: { paymentStatus: string } }) => {
      if (where.paymentStatus === "refunded") return Promise.resolve(3);
      if (where.paymentStatus === "chargeback") return Promise.resolve(2);
      return Promise.resolve(0);
    });
    prismaMock.layaway.count.mockResolvedValue(1);

    const summary = await loadAdminFinanceSummary();

    // Previously this only reflected the layaway count (1) — missed 3 order refunds + 2 chargebacks.
    expect(summary.refundedOrders).toBe(6);
  });
});
