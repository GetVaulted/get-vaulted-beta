import { describe, expect, it } from "vitest";
import { OrderPayoutStatus } from "@/generated/prisma/enums";
import {
  buildOrderShippingReconciliation,
  buyerShippingCentsFromOrder,
  loadAdminOutstandingShippingLiabilityReport,
} from "@/lib/admin/shipping-reconciliation";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_1",
    sellerId: "seller_1",
    paymentStatus: "paid",
    payoutStatus: OrderPayoutStatus.held,
    fulfillmentStatus: "pending",
    shippingStatus: null as string | null,
    shippingPriceUsd: 1,
    shippingChargedCents: 100,
    shippingLabelCostCents: null as number | null,
    shippingLabelCostReversedCents: 0,
    shippingLabelCostReversalId: null as string | null,
    shippoTransactionId: null as string | null,
    labelUrl: null as string | null,
    labelCreatedAt: null as Date | null,
    liveShippingSessionId: null as string | null,
    ...overrides,
  };
}

describe("buyerShippingCentsFromOrder", () => {
  it("prefers shippingChargedCents over shippingPriceUsd", () => {
    expect(buyerShippingCentsFromOrder({ shippingChargedCents: 100, shippingPriceUsd: 9.99 })).toBe(100);
  });

  it("falls back to rounded shippingPriceUsd", () => {
    expect(buyerShippingCentsFromOrder({ shippingChargedCents: null, shippingPriceUsd: 3.99 })).toBe(399);
  });
});

describe("buildOrderShippingReconciliation", () => {
  it("marks unpaid-label orders as no_label with zero variance", () => {
    const row = buildOrderShippingReconciliation(order());
    expect(row.labelStatus).toBe("none");
    expect(row.deductionStatus).toBe("no_label");
    expect(row.paidByPlatform).toBe(false);
    expect(row.flagged).toBe(false);
    expect(row.netShippingVarianceCents).toBe(0);
  });

  it("flags GV-paid label with no seller reimbursement", () => {
    const row = buildOrderShippingReconciliation(
      order({
        shippingLabelCostCents: 499,
        shippingLabelCostReversedCents: 0,
        shippoTransactionId: "shippo_tx_1",
        fulfillmentStatus: "label_created",
      }),
    );
    expect(row.paidByPlatform).toBe(true);
    expect(row.deductionStatus).toBe("label_purchased_pending_debit");
    expect(row.flagged).toBe(true);
    expect(row.flagReasons).toContain(
      "Get Vaulted paid a valid label but no seller reimbursement exists",
    );
    expect(row.netShippingVarianceCents).toBe(-499);
  });

  it("marks fully clawed-back label as deducted with zero variance", () => {
    const row = buildOrderShippingReconciliation(
      order({
        shippingLabelCostCents: 499,
        shippingLabelCostReversedCents: 499,
        shippingLabelCostReversalId: "trr_1",
        shippoTransactionId: "shippo_tx_1",
        fulfillmentStatus: "label_created",
      }),
    );
    expect(row.deductionStatus).toBe("deducted");
    expect(row.flagged).toBe(false);
    expect(row.netShippingVarianceCents).toBe(0);
  });

  it("flags cost/deduction mismatch", () => {
    const row = buildOrderShippingReconciliation(
      order({
        shippingLabelCostCents: 500,
        shippingLabelCostReversedCents: 400,
        shippoTransactionId: "shippo_tx_1",
      }),
    );
    expect(row.deductionStatus).toBe("partial");
    expect(row.flagged).toBe(true);
    expect(row.flagReasons).toContain("actualLabelCostCents !== sellerShippingDeductionCents");
  });

  it("flags reversal_failed shipping status", () => {
    const row = buildOrderShippingReconciliation(
      order({
        shippingLabelCostCents: 300,
        shippingLabelCostReversedCents: 0,
        shippingStatus: "label_cost_reversal_failed",
        fulfillmentStatus: "exception",
        shippoTransactionId: "shippo_tx_1",
      }),
    );
    expect(row.deductionStatus).toBe("reversal_failed");
    expect(row.labelStatus).toBe("exception");
    expect(row.flagged).toBe(true);
  });
});

function financeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "lf_1",
    orderId: "ord_1",
    shippoTransactionId: "tx_1",
    liveShippingSessionId: null as string | null,
    labelCostCents: 1000,
    status: "active",
    sellerClawbackCents: 0,
    sellerRecoveredCents: 0,
    writtenOffCents: 0,
    sellerCreditCents: 0,
    sellerCreditTransferId: null as string | null,
    liabilityEstablishedAt: null as Date | null,
    clawbackFailureDetail: null as string | null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    order: { sellerId: "seller_1" },
    ...overrides,
  };
}

function fakeOutstandingLiabilityDb(rows: ReturnType<typeof financeRow>[]) {
  return {
    shipmentLabelFinance: {
      findMany: async () => rows,
    },
  } as any;
}

describe("loadAdminOutstandingShippingLiabilityReport", () => {
  it("computes status counts and totals across all six statuses", async () => {
    const db = fakeOutstandingLiabilityDb([
      financeRow({ id: "lf_outstanding", labelCostCents: 1000 }),
      financeRow({ id: "lf_partial", labelCostCents: 1000, sellerClawbackCents: 400 }),
      financeRow({ id: "lf_recovered", labelCostCents: 1000, sellerClawbackCents: 1000 }),
      financeRow({ id: "lf_refund_pending", status: "refund_pending" }),
      financeRow({
        id: "lf_credited",
        status: "refunded",
        sellerClawbackCents: 1000,
        sellerCreditCents: 1000,
        sellerCreditTransferId: "tr_credit_1",
      }),
      financeRow({ id: "lf_written_off", labelCostCents: 1000, writtenOffCents: 1000 }),
    ]);

    const report = await loadAdminOutstandingShippingLiabilityReport(undefined, db);

    expect(report.rowCount).toBe(6);
    expect(report.statusCounts).toEqual({
      outstanding: 1,
      partially_recovered: 1,
      recovered: 1,
      refund_pending: 1,
      credited: 1,
      written_off: 1,
    });
    // lf_outstanding (1000) + lf_partial remainder (600) + lf_refund_pending (still chargeable
    // while awaiting Shippo confirmation, so still counted as owed: 1000) + lf_recovered/lf_credited/
    // lf_written_off (each fully covered, 0 remaining).
    expect(report.totalOutstandingCents).toBe(1000 + 600 + 1000);
    expect(report.totalRecoveredCents).toBe(0);
    expect(report.totalWrittenOffCents).toBe(1000);
  });

  it("sorts rows by outstandingCents descending", async () => {
    const db = fakeOutstandingLiabilityDb([
      financeRow({ id: "lf_small", labelCostCents: 200 }),
      financeRow({ id: "lf_large", labelCostCents: 900 }),
      financeRow({ id: "lf_mid", labelCostCents: 500 }),
    ]);

    const report = await loadAdminOutstandingShippingLiabilityReport(undefined, db);

    expect(report.rows.map((r) => r.shipmentLabelFinanceId)).toEqual(["lf_large", "lf_mid", "lf_small"]);
  });

  it("filters by statusFilter without affecting the aggregate totals", async () => {
    const db = fakeOutstandingLiabilityDb([
      financeRow({ id: "lf_outstanding", labelCostCents: 1000 }),
      financeRow({ id: "lf_recovered", labelCostCents: 1000, sellerClawbackCents: 1000 }),
    ]);

    const report = await loadAdminOutstandingShippingLiabilityReport({ statusFilter: "outstanding" }, db);

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.shipmentLabelFinanceId).toBe("lf_outstanding");
    // Aggregates reflect the full unfiltered ledger, not just the filtered rows shown.
    expect(report.rowCount).toBe(2);
    expect(report.totalOutstandingCents).toBe(1000);
  });
});
