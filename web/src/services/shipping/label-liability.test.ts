import { describe, expect, it, vi, beforeEach } from "vitest";

const updateMany = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 1 }));
vi.mock("@/lib/prisma", () => ({
  prisma: { shipmentLabelFinance: { updateMany } },
}));

import {
  markLiabilityEstablishedIfNeeded,
  outstandingLiabilityCentsForRow,
  resolveLabelLiabilityDisplayStatus,
  type LabelLiabilityRow,
} from "@/services/shipping/label-liability";

function row(overrides: Partial<LabelLiabilityRow> = {}): LabelLiabilityRow {
  return {
    id: "lf_1",
    orderId: "ord_1",
    shippoTransactionId: "tx_1",
    labelCostCents: 1000,
    status: "active",
    sellerClawbackCents: 0,
    sellerRecoveredCents: 0,
    writtenOffCents: 0,
    sellerCreditCents: 0,
    sellerCreditTransferId: null,
    ...overrides,
  };
}

describe("outstandingLiabilityCentsForRow", () => {
  it("is the full label cost when nothing has been clawed back, recovered, or written off", () => {
    expect(outstandingLiabilityCentsForRow(row())).toBe(1000);
  });

  it("is zero once the primary clawback fully covers the label cost", () => {
    expect(outstandingLiabilityCentsForRow(row({ sellerClawbackCents: 1000 }))).toBe(0);
  });

  it("is zero for refunded/voided/failed_purchase labels regardless of cost (no chargeable debt)", () => {
    expect(outstandingLiabilityCentsForRow(row({ status: "refunded", labelCostCents: 500 }))).toBe(0);
    expect(outstandingLiabilityCentsForRow(row({ status: "voided", labelCostCents: 500 }))).toBe(0);
    expect(outstandingLiabilityCentsForRow(row({ status: "failed_purchase", labelCostCents: 500 }))).toBe(0);
  });

  it("nets clawback + secondary recovery + write-off together against the label cost", () => {
    expect(
      outstandingLiabilityCentsForRow(
        row({ labelCostCents: 1000, sellerClawbackCents: 300, sellerRecoveredCents: 400, writtenOffCents: 300 }),
      ),
    ).toBe(0);
    expect(
      outstandingLiabilityCentsForRow(
        row({ labelCostCents: 1000, sellerClawbackCents: 300, sellerRecoveredCents: 400 }),
      ),
    ).toBe(300);
  });

  it("never goes negative when covered exceeds the label cost", () => {
    expect(outstandingLiabilityCentsForRow(row({ sellerClawbackCents: 5000 }))).toBe(0);
  });
});

describe("resolveLabelLiabilityDisplayStatus", () => {
  it("refund_pending takes precedence for refund_pending / void_pending Shippo status", () => {
    expect(resolveLabelLiabilityDisplayStatus(row({ status: "refund_pending" }))).toBe("refund_pending");
    expect(resolveLabelLiabilityDisplayStatus(row({ status: "void_pending" }))).toBe("refund_pending");
  });

  it("credited when a refunded/voided label had a clawback that was then credited back", () => {
    expect(
      resolveLabelLiabilityDisplayStatus(
        row({ status: "refunded", sellerClawbackCents: 1000, sellerCreditCents: 1000, sellerCreditTransferId: "tr_credit_1" }),
      ),
    ).toBe("credited");
  });

  it("recovered when a refunded/voided/failed_purchase label was never charged in the first place", () => {
    expect(resolveLabelLiabilityDisplayStatus(row({ status: "refunded" }))).toBe("recovered");
    expect(resolveLabelLiabilityDisplayStatus(row({ status: "failed_purchase", labelCostCents: 0 }))).toBe("recovered");
  });

  it("outstanding when a chargeable label has zero coverage from any mechanism", () => {
    expect(resolveLabelLiabilityDisplayStatus(row())).toBe("outstanding");
  });

  it("partially_recovered when some but not all of the cost is covered", () => {
    expect(resolveLabelLiabilityDisplayStatus(row({ sellerClawbackCents: 400 }))).toBe("partially_recovered");
    expect(resolveLabelLiabilityDisplayStatus(row({ sellerRecoveredCents: 250 }))).toBe("partially_recovered");
  });

  it("recovered when the primary clawback alone fully covers the label cost", () => {
    expect(resolveLabelLiabilityDisplayStatus(row({ sellerClawbackCents: 1000 }))).toBe("recovered");
  });

  it("recovered when clawback + secondary payout-offset recovery together fully cover the cost", () => {
    expect(
      resolveLabelLiabilityDisplayStatus(row({ sellerClawbackCents: 600, sellerRecoveredCents: 400 })),
    ).toBe("recovered");
  });

  it("written_off when an admin write-off (plus any partial recovery) fully closes out the liability", () => {
    expect(
      resolveLabelLiabilityDisplayStatus(row({ sellerClawbackCents: 200, writtenOffCents: 800 })),
    ).toBe("written_off");
  });
});

describe("markLiabilityEstablishedIfNeeded", () => {
  beforeEach(() => {
    updateMany.mockClear();
  });

  it("only sets liabilityEstablishedAt when it is currently null (idempotent, permanent marker)", async () => {
    await markLiabilityEstablishedIfNeeded("lf_1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lf_1", liabilityEstablishedAt: null },
      data: { liabilityEstablishedAt: expect.any(Date) },
    });
  });
});
