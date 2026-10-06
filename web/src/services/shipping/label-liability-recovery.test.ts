import { beforeEach, describe, expect, it, vi } from "vitest";

const financeStore = vi.hoisted(() => {
  const rows = new Map<string, any>();
  return { rows, reset: () => rows.clear() };
});
const recoveryStore = vi.hoisted(() => {
  const rows: any[] = [];
  return { rows, reset: () => (rows.length = 0) };
});

const prismaMock = vi.hoisted(() => {
  const api = {
    shipmentLabelFinance: {
      findMany: vi.fn(async ({ where }: any) => {
        const sellerId = where.order?.sellerId;
        const statusIn: string[] | undefined = where.status?.in;
        return [...financeStore.rows.values()]
          .filter((r) => r.sellerId === sellerId)
          .filter((r) => !statusIn || statusIn.includes(r.status))
          .sort((a, b) => a.createdAt - b.createdAt);
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = financeStore.rows.get(where.id);
        if (!row) throw new Error("not found");
        if (data.sellerRecoveredCents?.increment != null) {
          row.sellerRecoveredCents += data.sellerRecoveredCents.increment;
        }
        return row;
      }),
    },
    shipmentLabelLiabilityRecovery: {
      findFirst: vi.fn(async ({ where }: any) =>
        recoveryStore.rows.find(
          (r) => r.shipmentLabelFinanceId === where.shipmentLabelFinanceId && r.transactionId === where.transactionId,
        ) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        recoveryStore.rows.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (fn: any) => fn(api)),
  };
  return api;
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  applyOutstandingLiabilityRecovery,
  planOutstandingLiabilityRecoveryForSeller,
} from "@/services/shipping/label-liability-recovery";

function seedRow(id: string, overrides: any = {}) {
  financeStore.rows.set(id, {
    id,
    orderId: overrides.orderId ?? "ord_1",
    sellerId: "seller_1",
    shippoTransactionId: overrides.shippoTransactionId ?? `tx_${id}`,
    labelCostCents: 1000,
    status: "active",
    sellerClawbackCents: 0,
    sellerRecoveredCents: 0,
    writtenOffCents: 0,
    sellerCreditCents: 0,
    sellerCreditTransferId: null,
    createdAt: overrides.createdAt ?? 0,
    ...overrides,
  });
}

describe("planOutstandingLiabilityRecoveryForSeller", () => {
  beforeEach(() => {
    financeStore.reset();
    recoveryStore.reset();
    vi.clearAllMocks();
  });

  it("returns an empty plan when there is nothing available or nothing outstanding", async () => {
    expect(await planOutstandingLiabilityRecoveryForSeller("seller_1", 0)).toEqual({
      sellerId: "seller_1",
      items: [],
      totalCents: 0,
    });
    seedRow("lf_1", { sellerClawbackCents: 1000 }); // fully covered already
    expect((await planOutstandingLiabilityRecoveryForSeller("seller_1", 5000)).items).toEqual([]);
  });

  it("plans oldest outstanding liability first (FIFO) across multiple labels", async () => {
    seedRow("lf_old", { createdAt: 1, labelCostCents: 400 });
    seedRow("lf_new", { createdAt: 2, labelCostCents: 400 });

    const plan = await planOutstandingLiabilityRecoveryForSeller("seller_1", 500);
    expect(plan.totalCents).toBe(500);
    expect(plan.items).toEqual([
      { shipmentLabelFinanceId: "lf_old", orderId: "ord_1", shippoTransactionId: "tx_lf_old", amountCents: 400 },
      { shipmentLabelFinanceId: "lf_new", orderId: "ord_1", shippoTransactionId: "tx_lf_new", amountCents: 100 },
    ]);
  });

  it("never plans more than the amount actually available", async () => {
    seedRow("lf_1", { labelCostCents: 10000 });
    const plan = await planOutstandingLiabilityRecoveryForSeller("seller_1", 250);
    expect(plan.totalCents).toBe(250);
    expect(plan.items).toEqual([
      { shipmentLabelFinanceId: "lf_1", orderId: "ord_1", shippoTransactionId: "tx_lf_1", amountCents: 250 },
    ]);
  });

  it("ignores another seller's outstanding liability entirely", async () => {
    seedRow("lf_other", { sellerId: "seller_2", labelCostCents: 900 });
    const plan = await planOutstandingLiabilityRecoveryForSeller("seller_1", 900);
    expect(plan.items).toEqual([]);
  });
});

describe("applyOutstandingLiabilityRecovery", () => {
  beforeEach(() => {
    financeStore.reset();
    recoveryStore.reset();
    vi.clearAllMocks();
  });

  it("increments sellerRecoveredCents and records an audit-trail row per applied item", async () => {
    seedRow("lf_1", { labelCostCents: 1000 });
    const plan = await planOutstandingLiabilityRecoveryForSeller("seller_1", 1000);

    const result = await applyOutstandingLiabilityRecovery(plan, {
      method: "payout_offset_stripe",
      transactionId: "po_123",
    });

    expect(result).toEqual({ appliedCents: 1000, skippedCount: 0 });
    expect(financeStore.rows.get("lf_1").sellerRecoveredCents).toBe(1000);
    expect(recoveryStore.rows).toHaveLength(1);
    expect(recoveryStore.rows[0]).toMatchObject({
      shipmentLabelFinanceId: "lf_1",
      sellerId: "seller_1",
      method: "payout_offset_stripe",
      outcome: "recovered",
      amountCents: 1000,
      transactionId: "po_123",
    });
  });

  it("is idempotent: re-applying the same transactionId does not double-recover", async () => {
    seedRow("lf_1", { labelCostCents: 1000 });
    const plan = await planOutstandingLiabilityRecoveryForSeller("seller_1", 1000);

    await applyOutstandingLiabilityRecovery(plan, { method: "payout_offset_stripe", transactionId: "po_123" });
    const second = await applyOutstandingLiabilityRecovery(plan, {
      method: "payout_offset_stripe",
      transactionId: "po_123",
    });

    expect(second).toEqual({ appliedCents: 0, skippedCount: 1 });
    expect(financeStore.rows.get("lf_1").sellerRecoveredCents).toBe(1000);
    expect(recoveryStore.rows).toHaveLength(1);
  });

  it("a different transactionId against the same (now-reduced) outstanding label recovers only what remains", async () => {
    seedRow("lf_1", { labelCostCents: 1000 });
    const firstPlan = await planOutstandingLiabilityRecoveryForSeller("seller_1", 600);
    await applyOutstandingLiabilityRecovery(firstPlan, { method: "payout_offset_stripe", transactionId: "po_1" });

    const secondPlan = await planOutstandingLiabilityRecoveryForSeller("seller_1", 600);
    expect(secondPlan.totalCents).toBe(400);
    await applyOutstandingLiabilityRecovery(secondPlan, { method: "payout_offset_stripe", transactionId: "po_2" });

    expect(financeStore.rows.get("lf_1").sellerRecoveredCents).toBe(1000);
    expect(recoveryStore.rows).toHaveLength(2);
  });

  it("does nothing for an empty plan", async () => {
    const result = await applyOutstandingLiabilityRecovery(
      { sellerId: "seller_1", items: [], totalCents: 0 },
      { method: "payout_offset_paypal", transactionId: "item_1" },
    );
    expect(result).toEqual({ appliedCents: 0, skippedCount: 0 });
    expect(recoveryStore.rows).toHaveLength(0);
  });
});
