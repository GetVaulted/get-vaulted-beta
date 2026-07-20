import { beforeEach, describe, expect, it, vi } from "vitest";

const balanceRetrieve = vi.hoisted(() => vi.fn());
const transfersList = vi.hoisted(() => vi.fn());
const transfersCreate = vi.hoisted(() => vi.fn());
const accountsRetrieve = vi.hoisted(() => vi.fn());
const listReversals = vi.hoisted(() => vi.fn());

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
    order: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
    shipmentPackage: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    shipmentLabelFinance: {
      findMany: vi.fn(async ({ where }: any) =>
        [...financeStore.rows.values()].filter((r) => !where?.orderId || r.orderId === where.orderId),
      ),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const pair = where.orderId_shippoTransactionId;
        const k = financeStore.key(pair.orderId, pair.shippoTransactionId);
        const existing = financeStore.rows.get(k);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `lf_${financeStore.rows.size + 1}`, ...create };
        financeStore.rows.set(k, row);
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
    },
  };
  return api;
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    balance: { retrieve: balanceRetrieve },
    transfers: {
      list: transfersList,
      create: transfersCreate,
      listReversals,
    },
    accounts: { retrieve: accountsRetrieve },
  }),
}));

vi.mock("@/services/shipping/label-finance", async () => {
  const actual = await vi.importActual<typeof import("@/services/shipping/label-finance")>(
    "@/services/shipping/label-finance",
  );
  return {
    ...actual,
    recalculateOrderLabelFinanceSummary: vi.fn(async (orderId: string) => {
      const rows = [...financeStore.rows.values()].filter((r) => r.orderId === orderId);
      const gross = rows.reduce((s, r) => s + (r.sellerClawbackCents ?? 0), 0);
      const credit = rows.reduce((s, r) => s + (r.sellerCreditCents ?? 0), 0);
      return {
        shippingLabelCostCents: 0,
        shippingLabelCostReversedCents: Math.max(0, gross - credit),
        shippingLabelCostReversalId: null,
        shippingLabelCostChargedShippoTransactionId: null,
      };
    }),
  };
});

import {
  applyNeitherLabelChargedRepair,
  findExistingFailedLabelRepairTransfer,
  NEITHER_LABEL_CHARGED_ORDER_ID,
  NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS,
  planNeitherLabelChargedRepair,
} from "@/services/shipping/repair-neither-label-charged";
import {
  classifyShippoLabelRefundVerdict,
  extractProvenNoShippoCharge,
  extractShippoPurchaseProof,
} from "@/services/shipping/shippo-label-refund-status";
import { summarizeLabelFinanceRows } from "@/services/shipping/label-finance";
import { classifyDualLabelBillingEvidence } from "@/services/shipping/label-charge-evidence";

describe("NEITHER_LABEL_CHARGED classification + finance invariants", () => {
  it("1. ERROR + INVALID + no billing payments → failed_purchase", () => {
    const tx = {
      status: "ERROR",
      object_state: "INVALID",
      label_url: null,
      tracking_number: "",
      billing: { payments: [] },
    };
    const proof = extractShippoPurchaseProof(tx);
    expect(proof.affirmativelyPurchased).toBe(false);
    expect(extractProvenNoShippoCharge(tx, ["billing issue"])).toBe(true);
    expect(
      classifyShippoLabelRefundVerdict({
        transactionStatus: "ERROR",
        refundStatuses: [],
        purchaseProof: proof,
        provenNoShippoCharge: true,
      }),
    ).toBe("failed_purchase");
  });

  it("2–3. two failed attempts → zero chargeable label cost; never clawback-eligible", () => {
    const r = classifyDualLabelBillingEvidence({
      firstVerdict: "failed_purchase",
      secondVerdict: "failed_purchase",
    });
    expect(r.classification).toBe("NEITHER_LABEL_CHARGED");
    expect(r.financials.expectedChargeableLabelCostCents).toBe(0);
    expect(r.financials.expectedSellerCreditCents).toBe(3502);
  });

  it("4. two erroneous clawbacks require a 3502-cent credit", () => {
    expect(NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS).toBe(3502);
    const r = classifyDualLabelBillingEvidence({
      firstVerdict: "failed_purchase",
      secondVerdict: "failed_purchase",
      existingSellerCreditCents: 0,
    });
    expect(r.financials.expectedSellerCreditCents).toBe(3502);
    expect(r.financials.expectedNetSellerDeductionCents).toBe(0);
  });

  it("9–10. successful repair zeros order net summaries; finance retains clawbacks+credits", () => {
    const summary = summarizeLabelFinanceRows([
      {
        id: "a",
        orderId: NEITHER_LABEL_CHARGED_ORDER_ID,
        shippoTransactionId: "tx1",
        shippoShipmentId: null,
        labelCostCents: 0,
        purpose: "initial",
        replacesShippoTransactionId: null,
        status: "failed_purchase",
        sellerClawbackCents: 1751,
        sellerClawbackReversalId: "trr_1",
        sellerCreditCents: 1751,
        sellerCreditTransferId: "tr_credit",
        clawbackIdempotencyKey: null,
        creditIdempotencyKey: null,
      },
      {
        id: "b",
        orderId: NEITHER_LABEL_CHARGED_ORDER_ID,
        shippoTransactionId: "tx2",
        shippoShipmentId: null,
        labelCostCents: 0,
        purpose: "replacement",
        replacesShippoTransactionId: "tx1",
        status: "failed_purchase",
        sellerClawbackCents: 1751,
        sellerClawbackReversalId: "trr_2",
        sellerCreditCents: 1751,
        sellerCreditTransferId: "tr_credit",
        clawbackIdempotencyKey: null,
        creditIdempotencyKey: null,
      },
    ]);
    expect(summary.chargeableLabelCostCents).toBe(0);
    expect(summary.grossSellerClawbackCents).toBe(3502);
    expect(summary.sellerCreditCents).toBe(3502);
    expect(summary.netSellerDeductionCents).toBe(0);
  });

  it("11. failed selected-rate quotes are not purchased label costs", () => {
    const proof = extractShippoPurchaseProof({
      status: "ERROR",
      object_state: "INVALID",
      label_url: null,
      tracking_number: "",
      rate: "rate_quoted_1751",
    });
    expect(proof.affirmativelyPurchased).toBe(false);
  });

  it("12. successful replacement after failed initial charges only the successful label", () => {
    const r = classifyDualLabelBillingEvidence({
      firstVerdict: "failed_purchase",
      secondVerdict: "chargeable",
    });
    expect(r.financials.expectedChargeableLabelCostCents).toBe(1751);
    expect(r.financials.expectedNetSellerDeductionCents).toBe(1751);
    expect(r.financials.expectedSellerCreditCents).toBe(1751);
  });
});

describe("plan/applyNeitherLabelChargedRepair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    financeStore.reset();
    prismaMock.order.findUnique.mockResolvedValue({
      id: NEITHER_LABEL_CHARGED_ORDER_ID,
      liveShippingSessionId: "sess_1",
      stripeTransferId: "tr_orig",
      stripePaymentIntentId: "pi_1",
      seller: { stripeAccountId: "acct_1TtWOm2Ntr7FY4zG" },
    });
    prismaMock.shipmentLabelFinance.findMany.mockImplementation(async ({ where }: any) =>
      [...financeStore.rows.values()].filter((r) => !where?.orderId || r.orderId === where.orderId),
    );
    prismaMock.shipmentPackage.findMany.mockResolvedValue([
      {
        id: "pkg1",
        shippoTransactionId: "2fe5616d2e3748ef9569f193e432bf62",
        shippoShipmentId: "sh_1",
        labelCostCents: 1751,
        packageIndex: 0,
      },
      {
        id: "pkg2",
        shippoTransactionId: "edfcdb0bf1f14935b822c58599c46112",
        shippoShipmentId: "sh_2",
        labelCostCents: 1751,
        packageIndex: 0,
      },
    ]);
    accountsRetrieve.mockResolvedValue({ id: "acct_1TtWOm2Ntr7FY4zG", deleted: false });
    transfersList.mockResolvedValue({ data: [] });
    listReversals.mockResolvedValue({
      data: [
        { id: "trr_1", amount: 1751 },
        { id: "trr_2", amount: 1751 },
      ],
    });
    transfersCreate.mockResolvedValue({ id: "tr_repair_3502", amount: 3502 });
  });

  it("7–8. negative / insufficient available balance blocks repair; pending does not count", async () => {
    balanceRetrieve.mockResolvedValue({
      available: [{ currency: "usd", amount: -20256 }],
      pending: [{ currency: "usd", amount: 70978 }],
    });
    const plan = await planNeitherLabelChargedRepair(NEITHER_LABEL_CHARGED_ORDER_ID);
    expect(plan.proposedCreditCents).toBe(3502);
    expect(plan.balanceSufficient).toBe(false);
    expect(plan.platformPendingUsdCents).toBe(70978);
    expect(plan.idempotencyKey).toBe(
      `failed_label_clawback_credit_${NEITHER_LABEL_CHARGED_ORDER_ID}_3502`,
    );

    const applied = await applyNeitherLabelChargedRepair(NEITHER_LABEL_CHARGED_ORDER_ID);
    expect(applied).toMatchObject({ ok: false, code: "INSUFFICIENT_PLATFORM_BALANCE" });
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("5. repair idempotency prevents duplicate 3502-cent credit", async () => {
    balanceRetrieve.mockResolvedValue({
      available: [{ currency: "usd", amount: 10000 }],
      pending: [{ currency: "usd", amount: 0 }],
    });
    transfersList.mockResolvedValue({
      data: [
        {
          id: "tr_already",
          amount: 3502,
          metadata: {
            orderId: NEITHER_LABEL_CHARGED_ORDER_ID,
            reason: "failed_shippo_label_clawback_refund",
            repairClassification: "NEITHER_LABEL_CHARGED",
            repairIdempotencyKey: `failed_label_clawback_credit_${NEITHER_LABEL_CHARGED_ORDER_ID}_3502`,
          },
        },
      ],
    });

    const found = await findExistingFailedLabelRepairTransfer({
      destinationAccountId: "acct_1TtWOm2Ntr7FY4zG",
      orderId: NEITHER_LABEL_CHARGED_ORDER_ID,
      idempotencyKey: `failed_label_clawback_credit_${NEITHER_LABEL_CHARGED_ORDER_ID}_3502`,
    });
    expect(found).toHaveLength(1);

    const applied = await applyNeitherLabelChargedRepair(NEITHER_LABEL_CHARGED_ORDER_ID);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.skipped).toBe(true);
      expect(applied.transferId).toBe("tr_already");
    }
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("6. partial credit recovery is safe (Stripe success, DB incomplete)", async () => {
    balanceRetrieve.mockResolvedValue({
      available: [{ currency: "usd", amount: 10000 }],
      pending: [{ currency: "usd", amount: 0 }],
    });
    // Stripe already has the transfer; finance rows missing credits.
    transfersList.mockResolvedValue({
      data: [
        {
          id: "tr_partial",
          amount: 3502,
          metadata: {
            orderId: NEITHER_LABEL_CHARGED_ORDER_ID,
            reason: "failed_shippo_label_clawback_refund",
            repairIdempotencyKey: `failed_label_clawback_credit_${NEITHER_LABEL_CHARGED_ORDER_ID}_3502`,
          },
        },
      ],
    });

    const applied = await applyNeitherLabelChargedRepair(NEITHER_LABEL_CHARGED_ORDER_ID);
    expect(applied.ok).toBe(true);
    expect(transfersCreate).not.toHaveBeenCalled();
    const rows = [...financeStore.rows.values()];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.sellerCreditCents === 1751)).toBe(true);
    expect(rows.every((r) => r.sellerCreditTransferId === "tr_partial")).toBe(true);
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingLabelCostCents: 0,
          shippingLabelCostReversedCents: 0,
        }),
      }),
    );
  });

  it("applies a new 3502 credit when balance is sufficient and no prior transfer", async () => {
    balanceRetrieve.mockResolvedValue({
      available: [{ currency: "usd", amount: 5000 }],
      pending: [{ currency: "usd", amount: 99999 }],
    });
    const applied = await applyNeitherLabelChargedRepair(NEITHER_LABEL_CHARGED_ORDER_ID);
    expect(applied.ok).toBe(true);
    expect(transfersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 3502,
        destination: "acct_1TtWOm2Ntr7FY4zG",
        metadata: expect.objectContaining({
          reason: "failed_shippo_label_clawback_refund",
          repairClassification: "NEITHER_LABEL_CHARGED",
          orderId: NEITHER_LABEL_CHARGED_ORDER_ID,
        }),
      }),
      expect.objectContaining({
        idempotencyKey: `failed_label_clawback_credit_${NEITHER_LABEL_CHARGED_ORDER_ID}_3502`,
      }),
    );
  });
});
