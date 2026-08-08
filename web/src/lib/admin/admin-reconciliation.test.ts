import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  order: { findMany: vi.fn() },
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

import { loadAdminReconciliationReport, resolveReconciliationRangeStart } from "@/lib/admin/admin-reconciliation";

function marketplaceOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    itemPriceUsd: 100,
    shippingPriceUsd: 10,
    taxUsd: 8,
    taxRefundedCents: 0,
    totalUsd: 118,
    paymentStatus: "paid",
    payoutStatus: "held",
    payoutReserveAmountCents: 0,
    shippingLabelCostCents: null,
    shippingLabelCostReversedCents: 0,
    stripeProcessingFeeCents: null,
    listing: { isCompanyListing: false },
    liveShippingSession: null,
    ...overrides,
  };
}

describe("loadAdminReconciliationReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("splits gross sales into GMV, platform fee, tax, and shipping without double counting", async () => {
    prismaMock.order.findMany.mockResolvedValue([marketplaceOrder()]);

    const report = await loadAdminReconciliationReport("30d");

    expect(report.paidOrderCount).toBe(1);
    expect(report.grossSalesUsd).toBe(118);
    expect(report.gmvUsd).toBe(100);
    // Flat 6.75% marketplace fee on $100 item.
    expect(report.platformRevenueUsd).toBe(6.75);
    expect(report.salesTaxCollectedUsd).toBe(8);
    expect(report.shippingCollectedUsd).toBe(10);
    // Sales tax and shipping must never leak into platform revenue.
    expect(report.platformRevenueUsd).not.toBe(report.grossSalesUsd);
    // Seller net = item - fee + shipping - processing(2.9%×118+$0.30) = 100 - 6.75 + 10 - 3.72 = 99.53
    expect(report.sellerNetUsd).toBe(99.53);
    expect(report.processingFeesUsd).toBe(3.72);
  });

  it("excludes company listings from platform revenue; company seller net has no processing haircut", async () => {
    prismaMock.order.findMany.mockResolvedValue([marketplaceOrder({ listing: { isCompanyListing: true } })]);

    const report = await loadAdminReconciliationReport("30d");

    expect(report.platformRevenueUsd).toBe(0);
    expect(report.processingFeesUsd).toBe(0);
    expect(report.sellerNetUsd).toBe(110);
  });

  it("excludes cancelled/unpaid orders from GMV and gross sales", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      marketplaceOrder(),
      marketplaceOrder({ id: "order_2", paymentStatus: "pending" }),
      marketplaceOrder({ id: "order_3", paymentStatus: "failed" }),
    ]);

    const report = await loadAdminReconciliationReport("30d");

    expect(report.paidOrderCount).toBe(1);
    expect(report.gmvUsd).toBe(100);
  });

  it("tracks refunded orders separately and does not fold them back into GMV", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      marketplaceOrder(),
      marketplaceOrder({ id: "order_2", paymentStatus: "refunded", taxRefundedCents: 800 }),
    ]);

    const report = await loadAdminReconciliationReport("30d");

    expect(report.paidOrderCount).toBe(1);
    expect(report.gmvUsd).toBe(100);
    expect(report.refundAdjustments.refundedOrderCount).toBe(1);
    expect(report.refundAdjustments.refundedGrossUsd).toBe(118);
    expect(report.refundAdjustments.taxReversedUsd).toBe(8);
    // Documents current (flagged) behavior: platform fee on the refunded order is tracked but not
    // subtracted from platformRevenueUsd / companyNetRevenueUsd since it isn't reversed today.
    expect(report.refundAdjustments.platformFeeOnRefundedOrdersUsd).toBe(6.75);
    expect(report.platformRevenueUsd).toBe(6.75);
  });

  it("treats lost disputes (chargebacks) like refunds for reconciliation purposes", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      marketplaceOrder(),
      marketplaceOrder({ id: "order_2", paymentStatus: "chargeback", taxRefundedCents: 800 }),
    ]);

    const report = await loadAdminReconciliationReport("30d");

    expect(report.paidOrderCount).toBe(1);
    expect(report.refundAdjustments.refundedOrderCount).toBe(1);
    expect(report.refundAdjustments.chargebackOrderCount).toBe(1);
    expect(report.refundAdjustments.refundedGrossUsd).toBe(118);
  });

  it("counts purchased label cost as a sunk expense even for later-refunded orders", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      marketplaceOrder({ shippingLabelCostCents: 750 }),
      marketplaceOrder({ id: "order_2", paymentStatus: "refunded", shippingLabelCostCents: 500 }),
    ]);

    const report = await loadAdminReconciliationReport("30d");

    expect(report.shippingLabelCostUsd).toBe(12.5);
    // No seller reversal recorded → unrecovered label cost reduces company net.
    expect(report.companyNetRevenueUsd).toBe(report.platformRevenueUsd - 12.5);
  });

  it("does not reduce company net for label costs already clawed back from the seller", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      marketplaceOrder({
        shippingLabelCostCents: 750,
        shippingLabelCostReversedCents: 750,
      }),
    ]);

    const report = await loadAdminReconciliationReport("30d");

    expect(report.shippingLabelCostUsd).toBe(7.5);
    expect(report.companyNetRevenueUsd).toBe(report.platformRevenueUsd);
    // Seller net = 100 - 6.75 + 10 - 7.5 - 3.72 processing = 92.03
    expect(report.sellerNetUsd).toBe(92.03);
  });

  it("applies the live-show tiered fee instead of the flat marketplace rate for live orders", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      marketplaceOrder({
        liveShippingSession: {
          liveShowId: "room_1",
          liveShow: { completedSalesGmvUsd: 3500, status: "live" },
        },
      }),
    ]);

    const report = await loadAdminReconciliationReport("30d");

    expect(report.platformRevenueUsd).toBeLessThan(6.75);
    expect(report.platformRevenueUsd).toBeGreaterThan(0);
  });

  it("groups paid orders by payout status without dropping or duplicating orders", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      marketplaceOrder({ id: "order_1", payoutStatus: "held" }),
      marketplaceOrder({ id: "order_2", payoutStatus: "held" }),
      marketplaceOrder({ id: "order_3", payoutStatus: "paid_out" }),
    ]);

    const report = await loadAdminReconciliationReport("30d");

    const totalBucketed = report.payoutStatusBreakdown.reduce((sum, b) => sum + b.orderCount, 0);
    expect(totalBucketed).toBe(report.paidOrderCount);
    const held = report.payoutStatusBreakdown.find((b) => b.status === "held");
    const paidOut = report.payoutStatusBreakdown.find((b) => b.status === "paid_out");
    expect(held?.orderCount).toBe(2);
    expect(paidOut?.orderCount).toBe(1);
  });

  it("resolves a rolling 24h window", () => {
    const before = Date.now();
    const start = resolveReconciliationRangeStart("24h");
    const after = Date.now();
    expect(start).not.toBeNull();
    const ageMs = before - start!.getTime();
    expect(ageMs).toBeGreaterThanOrEqual(24 * 3600000 - 50);
    expect(after - start!.getTime()).toBeLessThanOrEqual(24 * 3600000 + 50);
  });
});
