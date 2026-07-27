import { beforeEach, describe, expect, it, vi } from "vitest";

const createReversal = vi.hoisted(() => vi.fn());
const retrievePi = vi.hoisted(() => vi.fn());
const reportUrgentPaymentAnomaly = vi.hoisted(() => vi.fn());
const verifyShippoLabelRefundStatus = vi.hoisted(() => vi.fn());
const creditSellerForLabelCost = vi.hoisted(() => vi.fn());

const financeStore = vi.hoisted(() => {
  const rows = new Map<string, any>();
  return {
    rows,
    key(orderId: string, tx: string) {
      return `${orderId}::${tx}`;
    },
    reset() {
      rows.clear();
    },
  };
});

const prismaMock = vi.hoisted(() => {
  const api = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "ord_1" }]),
    order: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
    shipmentLabelFinance: {
      findUnique: vi.fn(async ({ where }: any) => {
        const pair = where.orderId_shippoTransactionId;
        if (pair) return financeStore.rows.get(financeStore.key(pair.orderId, pair.shippoTransactionId)) ?? null;
        return null;
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        const txId = where?.shippoTransactionId;
        if (!txId) return null;
        for (const row of financeStore.rows.values()) {
          if (row.shippoTransactionId !== txId) continue;
          if (where.sellerClawbackReversalId?.not != null && !row.sellerClawbackReversalId) continue;
          if (where.sellerClawbackCents?.gt != null && !(row.sellerClawbackCents > where.sellerClawbackCents.gt)) {
            continue;
          }
          return row;
        }
        return null;
      }),
      count: vi.fn(async () => financeStore.rows.size),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `lf_${financeStore.rows.size + 1}`,
          sellerClawbackCents: 0,
          sellerClawbackReversalId: null,
          sellerCreditCents: 0,
          sellerCreditTransferId: null,
          ...data,
        };
        financeStore.rows.set(financeStore.key(data.orderId, data.shippoTransactionId), row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        for (const row of financeStore.rows.values()) {
          if (row.id === where.id) {
            Object.assign(row, data);
            return row;
          }
        }
        throw new Error("finance not found");
      }),
      findMany: vi.fn(async ({ where }: any) =>
        [...financeStore.rows.values()].filter((r) => r.orderId === where.orderId),
      ),
    },
    $transaction: vi.fn(async (fn: any) => fn(api)),
  };
  return api;
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    paymentIntents: { retrieve: retrievePi },
    transfers: { createReversal },
  }),
}));
vi.mock("@/lib/cron-anomaly-alert", () => ({ reportUrgentPaymentAnomaly }));
vi.mock("@/services/shipping/shippo-label-refund-status", () => ({
  verifyShippoLabelRefundStatus,
  financeStatusFromShippoVerdict: (verdict: string) => {
    if (verdict === "refunded") return "refunded";
    if (verdict === "failed_purchase") return "failed_purchase";
    if (verdict === "refund_pending" || verdict === "unknown") return "refund_pending";
    return "replaced";
  },
}));
vi.mock("@/services/shipping/credit-seller-label-cost", () => ({
  creditSellerForLabelCost,
}));

import {
  chargeSellerForLabelCost,
  markOrderLabelCostReversalFailed,
} from "@/services/shipping/charge-seller-label-cost";

describe("chargeSellerForLabelCost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    financeStore.reset();
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      sellerId: "seller_1",
      stripePaymentIntentId: "pi_1",
      stripeTransferId: "tr_1",
      paymentProcessor: "STRIPE",
      shippingLabelCostReversedCents: 0,
      shippingLabelCostReversalId: null,
      shippingLabelCostChargedShippoTransactionId: null,
    });
    prismaMock.order.update.mockImplementation(async ({ data }: any) => ({ id: "ord_1", ...data }));
    retrievePi.mockResolvedValue({
      latest_charge: { transfer: { id: "tr_1" } },
    });
    createReversal.mockResolvedValue({ id: "trr_1", amount: 548 });
    verifyShippoLabelRefundStatus.mockResolvedValue({
      shippoTransactionId: "shippo_tx_old",
      transactionStatus: "SUCCESS",
      refundStatuses: [],
      verdict: "chargeable",
    });
    creditSellerForLabelCost.mockResolvedValue({
      ok: true,
      creditCents: 0,
      transferId: null,
      skipped: true,
    });
  });

  it("never claws back when Shippo purchase is failed_purchase (ERROR/INVALID)", async () => {
    verifyShippoLabelRefundStatus.mockResolvedValue({
      shippoTransactionId: "shippo_tx_fail",
      transactionStatus: "ERROR",
      refundStatuses: [],
      verdict: "failed_purchase",
      messages: ["billing issue", "Labels are not available while invoices are past due."],
      rawTransaction: { object_state: "INVALID", billing: { payments: [] } },
    });
    const result = await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 1751,
      shippoTransactionId: "shippo_tx_fail",
      purpose: "initial",
    });
    expect(result).toMatchObject({ ok: false, code: "SHIPPO_PURCHASE_NOT_SUCCESSFUL" });
    expect(createReversal).not.toHaveBeenCalled();
    const row = financeStore.rows.get(financeStore.key("ord_1", "shippo_tx_fail"));
    expect(row?.status).toBe("failed_purchase");
    expect(row?.labelCostCents).toBe(0);
    expect(row?.quotedLabelCostCents).toBe(1751);
  });

  it("charges the first label once and stores label finance", async () => {
    const result = await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 548,
      shippoTransactionId: "shippo_tx_1",
      purpose: "initial",
    });

    expect(result).toMatchObject({ ok: true, skipped: false, reversalId: "trr_1" });
    expect(createReversal).toHaveBeenCalledTimes(1);
    expect(createReversal).toHaveBeenCalledWith(
      "tr_1",
      expect.objectContaining({ amount: 548 }),
      expect.objectContaining({
        idempotencyKey: "label_clawback_shippo_tx_1_548",
      }),
    );
    const stored = financeStore.rows.get(financeStore.key("ord_1", "shippo_tx_1"));
    expect(stored.sellerClawbackReversalId).toBe("trr_1");
    expect(stored.sellerClawbackCents).toBe(548);
  });

  it("skips when the same Shippo transaction was already charged", async () => {
    financeStore.rows.set(financeStore.key("ord_1", "shippo_tx_1"), {
      id: "lf_1",
      orderId: "ord_1",
      shippoTransactionId: "shippo_tx_1",
      labelCostCents: 548,
      purpose: "initial",
      status: "active",
      sellerClawbackCents: 548,
      sellerClawbackReversalId: "trr_1",
      sellerCreditCents: 0,
      sellerCreditTransferId: null,
    });

    const result = await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 548,
      shippoTransactionId: "shippo_tx_1",
    });

    expect(result).toMatchObject({ ok: true, skipped: true, reversalId: "trr_1" });
    expect(createReversal).not.toHaveBeenCalled();
  });

  it("regeneration creates separate label history and does not blind-stack order prior", async () => {
    financeStore.rows.set(financeStore.key("ord_1", "shippo_tx_1"), {
      id: "lf_1",
      orderId: "ord_1",
      shippoTransactionId: "shippo_tx_1",
      labelCostCents: 548,
      purpose: "initial",
      status: "active",
      sellerClawbackCents: 548,
      sellerClawbackReversalId: "trr_1",
      sellerCreditCents: 0,
      sellerCreditTransferId: null,
      replacesShippoTransactionId: null,
    });
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      sellerId: "seller_1",
      stripePaymentIntentId: "pi_1",
      stripeTransferId: "tr_1",
      paymentProcessor: "STRIPE",
      shippingLabelCostReversedCents: 548,
      shippingLabelCostReversalId: "trr_1",
      shippingLabelCostChargedShippoTransactionId: "shippo_tx_1",
    });
    createReversal.mockResolvedValue({ id: "trr_2", amount: 600 });

    const result = await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 600,
      shippoTransactionId: "shippo_tx_2",
      purpose: "replacement",
      replacesShippoTransactionId: "shippo_tx_1",
    });

    expect(result.ok).toBe(true);
    expect(createReversal).toHaveBeenCalledTimes(1);
    expect(verifyShippoLabelRefundStatus).toHaveBeenCalledWith("shippo_tx_1");
    expect(financeStore.rows.get(financeStore.key("ord_1", "shippo_tx_2"))?.sellerClawbackReversalId).toBe(
      "trr_2",
    );
    // Prior remains chargeable → net = 548 + 600
    expect(result).toMatchObject({ ok: true, reversedCents: 1148 });
  });

  it("credits seller when replaced prior label is refunded", async () => {
    financeStore.rows.set(financeStore.key("ord_1", "shippo_tx_1"), {
      id: "lf_1",
      orderId: "ord_1",
      shippoTransactionId: "shippo_tx_1",
      labelCostCents: 1751,
      purpose: "initial",
      status: "active",
      sellerClawbackCents: 1751,
      sellerClawbackReversalId: "trr_1",
      sellerCreditCents: 0,
      sellerCreditTransferId: null,
    });
    verifyShippoLabelRefundStatus.mockImplementation(async (txId: string) => {
      if (txId === "shippo_tx_1") {
        return {
          shippoTransactionId: "shippo_tx_1",
          transactionStatus: "REFUNDED",
          refundStatuses: ["SUCCESS"],
          verdict: "refunded" as const,
          messages: [],
        };
      }
      return {
        shippoTransactionId: txId,
        transactionStatus: "SUCCESS",
        refundStatuses: [],
        verdict: "chargeable" as const,
        messages: [],
      };
    });
    creditSellerForLabelCost.mockImplementation(async () => {
      const prior = financeStore.rows.get(financeStore.key("ord_1", "shippo_tx_1"));
      prior.sellerCreditCents = 1751;
      prior.sellerCreditTransferId = "tr_credit_1";
      prior.status = "refunded";
      return { ok: true, creditCents: 1751, transferId: "tr_credit_1", skipped: false };
    });
    createReversal.mockResolvedValue({ id: "trr_2", amount: 1751 });

    const result = await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 1751,
      shippoTransactionId: "shippo_tx_2",
      purpose: "replacement",
      replacesShippoTransactionId: "shippo_tx_1",
    });

    expect(creditSellerForLabelCost).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "ord_1",
        shippoTransactionId: "shippo_tx_1",
        creditCents: 1751,
      }),
    );
    expect(result).toMatchObject({ ok: true, reversedCents: 1751 });
  });

  it("pending refund remains an exception path without seller credit", async () => {
    financeStore.rows.set(financeStore.key("ord_1", "shippo_tx_1"), {
      id: "lf_1",
      orderId: "ord_1",
      shippoTransactionId: "shippo_tx_1",
      labelCostCents: 1751,
      purpose: "initial",
      status: "active",
      sellerClawbackCents: 1751,
      sellerClawbackReversalId: "trr_1",
      sellerCreditCents: 0,
      sellerCreditTransferId: null,
    });
    verifyShippoLabelRefundStatus.mockImplementation(async (txId: string) => {
      if (txId === "shippo_tx_1") {
        return {
          shippoTransactionId: "shippo_tx_1",
          transactionStatus: "REFUNDPENDING",
          refundStatuses: ["PENDING"],
          verdict: "refund_pending" as const,
          messages: [],
        };
      }
      return {
        shippoTransactionId: txId,
        transactionStatus: "SUCCESS",
        refundStatuses: [],
        verdict: "chargeable" as const,
        messages: [],
      };
    });
    createReversal.mockResolvedValue({ id: "trr_2", amount: 1751 });

    await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 1751,
      shippoTransactionId: "shippo_tx_2",
      purpose: "replacement",
      replacesShippoTransactionId: "shippo_tx_1",
    });

    expect(creditSellerForLabelCost).not.toHaveBeenCalled();
    expect(financeStore.rows.get(financeStore.key("ord_1", "shippo_tx_1"))?.status).toBe(
      "refund_pending",
    );
  });

  it("clawback retry cannot double-charge the same transaction", async () => {
    await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 548,
      shippoTransactionId: "shippo_tx_1",
    });
    createReversal.mockClear();
    const second = await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 548,
      shippoTransactionId: "shippo_tx_1",
    });
    expect(second).toMatchObject({ ok: true, skipped: true });
    expect(createReversal).not.toHaveBeenCalled();
  });

  it("marks fulfillment exception when reversal fails after label purchase", async () => {
    createReversal.mockRejectedValue(new Error("insufficient funds"));
    const result = await chargeSellerForLabelCost({
      orderId: "ord_1",
      labelCostCents: 548,
      shippoTransactionId: "shippo_tx_1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REVERSAL_FAILED");
    expect(reportUrgentPaymentAnomaly).toHaveBeenCalled();

    await markOrderLabelCostReversalFailed("ord_1");
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: {
        fulfillmentStatus: "exception",
        shippingStatus: "label_cost_reversal_failed",
      },
    });
  });
});
