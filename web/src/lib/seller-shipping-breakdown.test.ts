import { describe, expect, it } from "vitest";
import {
  aggregateSellerShippingBreakdowns,
  resolveSellerShippingBreakdown,
} from "@/lib/seller-shipping-breakdown";
import type { LabelFinanceRow } from "@/services/shipping/label-finance";

function financeRow(overrides: Partial<LabelFinanceRow> = {}): LabelFinanceRow {
  return {
    id: "lf_1",
    orderId: "ord_1",
    shippoTransactionId: "txn_1",
    shippoShipmentId: "shp_1",
    labelCostCents: 725,
    purpose: "initial",
    replacesShippoTransactionId: null,
    status: "active",
    sellerClawbackCents: 725,
    sellerClawbackReversalId: "trr_1",
    sellerCreditCents: 0,
    sellerCreditTransferId: null,
    clawbackIdempotencyKey: "k1",
    creditIdempotencyKey: null,
    ...overrides,
  };
}

describe("resolveSellerShippingBreakdown", () => {
  it("shows buyer shipping and actual label cost separately", () => {
    const b = resolveSellerShippingBreakdown({
      shippingChargedCents: 399,
      shippingPriceUsd: 3.99,
      labelFinances: [financeRow({ labelCostCents: 725, sellerClawbackCents: 725 })],
      carrier: "USPS",
      service: "Priority",
      trackingNumber: "9400",
      labelCreatedAt: "2026-07-19T12:00:00.000Z",
    });
    expect(b.buyerShippingCollectedCents).toBe(399);
    expect(b.actualLabelCostCents).toBe(725);
    expect(b.netShippingImpactCents).toBe(399 - 725);
    expect(b.labelStatus).toBe("purchased");
  });

  it("successful $7.25 label populates Actual label cost = $7.25", () => {
    const b = resolveSellerShippingBreakdown({
      shippingChargedCents: 999,
      labelFinances: [financeRow({ labelCostCents: 725 })],
    });
    expect(b.actualLabelCostCents).toBe(725);
  });

  it("failed Shippo purchase displays $0 actual cost, not the quote", () => {
    const b = resolveSellerShippingBreakdown({
      shippingChargedCents: 399,
      shippingLabelCostCents: 725, // legacy quote leftover must not win over finance
      labelFinances: [
        financeRow({
          status: "failed_purchase",
          labelCostCents: 0,
          sellerClawbackCents: 0,
          sellerClawbackReversalId: null,
        }),
      ],
    });
    expect(b.actualLabelCostCents).toBe(0);
    expect(b.labelStatus).toBe("failed");
  });

  it("refunded label displays refund and corrected net shipping impact", () => {
    const b = resolveSellerShippingBreakdown({
      shippingChargedCents: 999,
      labelFinances: [
        financeRow({
          status: "refunded",
          labelCostCents: 650,
          sellerClawbackCents: 650,
          sellerCreditCents: 650,
          sellerCreditTransferId: "tr_credit",
        }),
      ],
    });
    expect(b.labelStatus).toBe("refunded");
    expect(b.actualLabelCostCents).toBe(650);
    expect(b.labelRefundOrCreditCents).toBe(650);
    expect(b.netShippingImpactCents).toBe(999 - 650 + 650);
  });

  it("pending when no purchase evidence", () => {
    const b = resolveSellerShippingBreakdown({
      shippingChargedCents: 399,
      shippingLabelCostCents: null,
    });
    expect(b.actualLabelCostCents).toBeNull();
    expect(b.labelStatus).toBe("pending");
  });

  it("Get Vaulted fee never includes a label clawback (shipping is separate)", () => {
    const b = resolveSellerShippingBreakdown({
      shippingChargedCents: 399,
      labelFinances: [financeRow({ labelCostCents: 725, sellerClawbackCents: 725 })],
    });
    // Shipping breakdown exposes label cost; callers must not fold into platformFeeCents.
    expect(b.actualLabelCostCents).toBe(725);
    expect(b.buyerShippingCollectedCents).toBe(399);
  });
});

describe("aggregateSellerShippingBreakdowns", () => {
  it("show summary totals match order-level shipping ledgers", () => {
    const rows = [
      resolveSellerShippingBreakdown({
        shippingChargedCents: 399,
        labelFinances: [financeRow({ labelCostCents: 725, shippoTransactionId: "t1" })],
      }),
      resolveSellerShippingBreakdown({
        shippingChargedCents: 999,
        labelFinances: [
          financeRow({
            id: "lf_2",
            shippoTransactionId: "t2",
            labelCostCents: 650,
            sellerClawbackCents: 650,
          }),
        ],
      }),
      resolveSellerShippingBreakdown({ shippingChargedCents: 500 }),
    ];
    const agg = aggregateSellerShippingBreakdowns(rows);
    expect(agg.totalBuyerShippingCollectedCents).toBe(399 + 999 + 500);
    expect(agg.totalActualLabelCostCents).toBe(725 + 650);
    expect(agg.pendingLabelCount).toBe(1);
    expect(agg.netShippingImpactCents).toBe(399 + 999 + 500 - 725 - 650);
  });

  it("bundle label cost is represented on the debit order finance rows", () => {
    // Sibling orders have $0 finance; debit order holds full bundle cost.
    const debit = resolveSellerShippingBreakdown({
      shippingChargedCents: 500,
      labelFinances: [financeRow({ labelCostCents: 1200, shippoTransactionId: "bundle_tx" })],
    });
    const sibling = resolveSellerShippingBreakdown({
      shippingChargedCents: 500,
      shippingLabelCostCents: 0,
      labelFinances: [],
      labelUrl: "https://label",
      shippoTransactionId: "bundle_tx",
    });
    const agg = aggregateSellerShippingBreakdowns([debit, sibling]);
    expect(debit.actualLabelCostCents).toBe(1200);
    // Sibling with shared label url but no finance / zero legacy cost → quoted (not double-count).
    expect(sibling.actualLabelCostCents).toBeNull();
    expect(agg.totalActualLabelCostCents).toBe(1200);
  });
});
