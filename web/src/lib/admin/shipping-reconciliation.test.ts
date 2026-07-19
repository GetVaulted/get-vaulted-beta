import { describe, expect, it } from "vitest";
import { OrderPayoutStatus } from "@/generated/prisma/enums";
import { buildOrderShippingReconciliation, buyerShippingCentsFromOrder } from "@/lib/admin/shipping-reconciliation";

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
