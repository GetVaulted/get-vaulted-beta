import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  order: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { loadAdminReconciliationReport } from "@/lib/admin/admin-reconciliation";

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
    // Flat 8% marketplace fee on $100 item.
    expect(report.platformRevenueUsd).toBe(8);
    expect(report.salesTaxCollectedUsd).toBe(8);
    expect(report.shippingCollectedUsd).toBe(10);
    // Sales tax and shipping must never leak into platform revenue.
    expect(report.platformRevenueUsd).not.toBe(report.grossSalesUsd);
    // Seller net = item - fee - reserve + shipping = 100 - 8 - 0 + 10 = 102.
    expect(report.sellerNetUsd).toBe(102);
  });

  it("excludes company listings from platform revenue and seller net", async () => {
    prismaMock.order.findMany.mockResolvedValue([marketplaceOrder({ listing: { isCompanyListing: true } })]);

    const report = await loadAdminReconciliationReport("30d");

    expect(report.platformRevenueUsd).toBe(0);
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
    expect(report.refundAdjustments.platformFeeOnRefundedOrdersUsd).toBe(8);
    expect(report.platformRevenueUsd).toBe(8);
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
    expect(report.companyNetRevenueUsd).toBe(report.platformRevenueUsd - 12.5);
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

    expect(report.platformRevenueUsd).toBeLessThan(8);
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
});
