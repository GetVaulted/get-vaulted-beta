import { describe, expect, it } from "vitest";
import {
  buildLabelClawbackIdempotencyKey,
  buildLabelCreditIdempotencyKey,
  ensureShipmentLabelFinanceRecord,
  inferLabelPurpose,
  isLabelCostChargeable,
  resolveLabelFinanceActionStatus,
  summarizeLabelFinanceRows,
  type LabelFinanceRow,
} from "@/services/shipping/label-finance";

function row(overrides: Partial<LabelFinanceRow> = {}): LabelFinanceRow {
  return {
    id: "lf_1",
    orderId: "ord_1",
    shippoTransactionId: "tx_1",
    shippoShipmentId: "sh_1",
    labelCostCents: 1751,
    purpose: "initial",
    replacesShippoTransactionId: null,
    status: "active",
    sellerClawbackCents: 1751,
    sellerClawbackReversalId: "trr_1",
    sellerCreditCents: 0,
    sellerCreditTransferId: null,
    clawbackIdempotencyKey: "k1",
    creditIdempotencyKey: null,
    sellerRecoveredCents: 0,
    writtenOffCents: 0,
    ...overrides,
  };
}

describe("label-finance helpers", () => {
  it("treats refunded/voided as not chargeable", () => {
    expect(isLabelCostChargeable("active")).toBe(true);
    expect(isLabelCostChargeable("replaced")).toBe(true);
    expect(isLabelCostChargeable("refund_pending")).toBe(true);
    expect(isLabelCostChargeable("refunded")).toBe(false);
    expect(isLabelCostChargeable("voided")).toBe(false);
  });

  it("builds stable idempotency keys including amount", () => {
    expect(
      buildLabelClawbackIdempotencyKey({
        orderId: "ord_1",
        shippoTransactionId: "tx_a",
        labelCostCents: 1751,
      }),
    ).toBe("label_clawback_tx_a_1751");
    // Same Shippo label on a sibling order must reuse the same Stripe idempotency key.
    expect(
      buildLabelClawbackIdempotencyKey({
        orderId: "ord_sibling",
        shippoTransactionId: "tx_a",
        labelCostCents: 1751,
      }),
    ).toBe("label_clawback_tx_a_1751");
    expect(
      buildLabelCreditIdempotencyKey({
        orderId: "ord_1",
        shippoTransactionId: "tx_a",
        creditCents: 1751,
      }),
    ).toBe("label_credit_ord_1_tx_a_1751");
  });

  it("infers replacement vs additional package", () => {
    expect(
      inferLabelPurpose({
        replacesShippoTransactionId: "tx_old",
        existingActiveOrReplacedCount: 1,
      }),
    ).toBe("replacement");
    expect(
      inferLabelPurpose({
        packageIndex: 1,
        existingActiveOrReplacedCount: 1,
      }),
    ).toBe("additional_package");
    expect(inferLabelPurpose({ existingActiveOrReplacedCount: 0 })).toBe("initial");
  });

  it("summarizes chargeable cost and net seller deduction", () => {
    const summary = summarizeLabelFinanceRows([
      row({
        status: "refunded",
        sellerClawbackCents: 1751,
        sellerCreditCents: 1751,
        sellerCreditTransferId: "tr_credit",
      }),
      row({
        id: "lf_2",
        shippoTransactionId: "tx_2",
        purpose: "replacement",
        status: "active",
        sellerClawbackCents: 1751,
        sellerClawbackReversalId: "trr_2",
      }),
    ]);
    expect(summary.chargeableLabelCostCents).toBe(1751);
    expect(summary.grossSellerClawbackCents).toBe(3502);
    expect(summary.sellerCreditCents).toBe(1751);
    expect(summary.netSellerDeductionCents).toBe(1751);
  });

  it("preserves both charges when replaced label stays chargeable", () => {
    const summary = summarizeLabelFinanceRows([
      row({ status: "replaced", sellerClawbackCents: 1751, sellerClawbackReversalId: "trr_1" }),
      row({
        id: "lf_2",
        shippoTransactionId: "tx_2",
        purpose: "replacement",
        status: "active",
        sellerClawbackCents: 1751,
        sellerClawbackReversalId: "trr_2",
      }),
    ]);
    expect(summary.chargeableLabelCostCents).toBe(3502);
    expect(summary.netSellerDeductionCents).toBe(3502);
    expect(
      resolveLabelFinanceActionStatus({ ...summary, labelCount: 2 }),
    ).toBe("reconciled_multiple_labels");
  });

  it("flags pending refund and overcharge", () => {
    expect(
      resolveLabelFinanceActionStatus({
        ...summarizeLabelFinanceRows([
          row({ status: "refund_pending", sellerClawbackCents: 1751, sellerClawbackReversalId: "trr_1" }),
          row({
            id: "lf_2",
            shippoTransactionId: "tx_2",
            status: "active",
            sellerClawbackCents: 1751,
            sellerClawbackReversalId: "trr_2",
          }),
        ]),
        labelCount: 2,
      }),
    ).toBe("waiting_for_shippo_refund");

    expect(
      resolveLabelFinanceActionStatus({
        chargeableLabelCostCents: 1751,
        grossSellerClawbackCents: 3502,
        sellerCreditCents: 0,
        netSellerDeductionCents: 3502,
        latestClawbackReversalId: "trr_2",
        latestChargedShippoTransactionId: "tx_2",
        hasRefundPending: false,
        labelsMissingClawback: [],
        labelsNeedingCredit: [],
        labelCount: 1,
      }),
    ).toBe("overcharge");
  });

  it("keeps additional packages cumulatively chargeable", () => {
    const summary = summarizeLabelFinanceRows([
      row({ purpose: "initial", labelCostCents: 1000, sellerClawbackCents: 1000 }),
      row({
        id: "lf_2",
        shippoTransactionId: "tx_2",
        purpose: "additional_package",
        labelCostCents: 800,
        sellerClawbackCents: 800,
        sellerClawbackReversalId: "trr_2",
      }),
    ]);
    expect(summary.chargeableLabelCostCents).toBe(1800);
    expect(summary.netSellerDeductionCents).toBe(1800);
  });
});

/** Minimal in-memory fake standing in for the `db` param — no need to mock the real prisma client. */
function fakeFinanceDb() {
  const rows = new Map<string, any>();
  const byPackage = new Map<string, string>();
  return {
    rows,
    db: {
      shipmentLabelFinance: {
        findUnique: async ({ where }: any) => {
          if (where.orderId_shippoTransactionId) {
            const { orderId, shippoTransactionId } = where.orderId_shippoTransactionId;
            for (const r of rows.values()) {
              if (r.orderId === orderId && r.shippoTransactionId === shippoTransactionId) return r;
            }
            return null;
          }
          if (where.shipmentPackageId) {
            const id = byPackage.get(where.shipmentPackageId);
            return id ? rows.get(id) : null;
          }
          return null;
        },
        update: async ({ where, data }: any) => {
          const row = rows.get(where.id);
          Object.assign(row, data);
          return row;
        },
        create: async ({ data }: any) => {
          const id = `lf_${rows.size + 1}`;
          const row = { id, ...data };
          rows.set(id, row);
          if (row.shipmentPackageId) byPackage.set(row.shipmentPackageId, id);
          return row;
        },
      },
    } as any,
  };
}

describe("ensureShipmentLabelFinanceRecord", () => {
  it("creates exactly one durable row for a fresh Shippo transaction", async () => {
    const { db, rows } = fakeFinanceDb();
    const result = await ensureShipmentLabelFinanceRecord(
      {
        orderId: "ord_1",
        shippoTransactionId: "tx_1",
        shippoShipmentId: "sh_1",
        shipmentPackageId: "pkg_1",
        liveShippingSessionId: "sess_1",
        labelCostCents: 548,
        purpose: "initial",
      },
      db,
    );
    expect(result.created).toBe(true);
    expect(rows.size).toBe(1);
    const stored = [...rows.values()][0];
    expect(stored).toMatchObject({
      orderId: "ord_1",
      shippoTransactionId: "tx_1",
      labelCostCents: 548,
      status: "active",
      shipmentPackageId: "pkg_1",
    });
  });

  it("is idempotent for the same (orderId, shippoTransactionId) — never creates a second row", async () => {
    const { db, rows } = fakeFinanceDb();
    await ensureShipmentLabelFinanceRecord(
      { orderId: "ord_1", shippoTransactionId: "tx_1", labelCostCents: 548, purpose: "initial" },
      db,
    );
    const second = await ensureShipmentLabelFinanceRecord(
      { orderId: "ord_1", shippoTransactionId: "tx_1", labelCostCents: 548, purpose: "initial" },
      db,
    );
    expect(second.created).toBe(false);
    expect(rows.size).toBe(1);
  });

  it("reuses the existing row when the same package is retried against a new debit order", async () => {
    const { db, rows } = fakeFinanceDb();
    const first = await ensureShipmentLabelFinanceRecord(
      { orderId: "ord_1", shippoTransactionId: "tx_1", shipmentPackageId: "pkg_1", labelCostCents: 548, purpose: "initial" },
      db,
    );
    const second = await ensureShipmentLabelFinanceRecord(
      { orderId: "ord_1", shippoTransactionId: "tx_1", shipmentPackageId: "pkg_1", labelCostCents: 548, purpose: "initial" },
      db,
    );
    expect(second.id).toBe(first.id);
    expect(rows.size).toBe(1);
  });
});
