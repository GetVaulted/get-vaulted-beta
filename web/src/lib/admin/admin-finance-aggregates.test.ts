import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePlatformFeePercentForSellerOrder } from "@/lib/seller-payout-estimate";

const prismaMock = vi.hoisted(() => ({
  order: { findMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
  layaway: { count: vi.fn().mockResolvedValue(0) },
  sellerPayoutMetrics: { aggregate: vi.fn().mockResolvedValue({ _sum: { unresolvedDisputeCount: 0 } }) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { loadAdminFinanceSummary } from "@/lib/admin/admin-finance-aggregates";

describe("loadAdminFinanceSummary fee-tier consistency with seller reports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the live-show tiered fee percent for live orders instead of the flat marketplace percent", async () => {
    // Show has already completed $3,500 in GMV (past the tier-3 threshold), so per
    // `resolvePlatformFeePercentForSellerOrder` this $100 sale should fee at the tier-3 rate
    // (6.5%), NOT the flat 8% marketplace rate the admin dashboard used before this fix.
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

    // Sanity: confirm the seller-report resolver actually picks the tiered (non-flat) percent for
    // this fixture, so this test would fail loudly if the fee policy itself changes.
    const expectedPct = resolvePlatformFeePercentForSellerOrder({
      isCompanyListing: false,
      liveShowId: "room_1",
      liveShowCompletedGmvUsd: 3500,
      orderItemPriceUsd: 100,
      orderPaymentStatus: "paid",
    });
    expect(expectedPct).not.toBe(8);
    expect(expectedPct).toBeLessThan(8);

    const expectedFeeUsd = Math.round(((100 * expectedPct) / 100) * 100) / 100;
    expect(summary.platformFeesUsd).toBe(expectedFeeUsd);
    expect(summary.platformFeesUsd).not.toBe(8); // would be 8 if flat 8% were (wrongly) applied
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

    expect(summary.platformFeesUsd).toBe(8);
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

  it("includes shipping pass-through in pending seller payout, matching the seller Sales report", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        itemPriceUsd: 100,
        shippingPriceUsd: 15,
        totalUsd: 123,
        paymentStatus: "paid",
        payoutStatus: "held",
        payoutReserveAmountCents: 0,
        listing: { isCompanyListing: false },
        liveShippingSession: null,
      },
    ]);

    const summary = await loadAdminFinanceSummary();

    // Seller net = item(100) - fee(8) - reserve(0) + shipping(15) = 107; "held" counts as pending.
    expect(summary.pendingPayoutsUsd).toBe(107);
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
