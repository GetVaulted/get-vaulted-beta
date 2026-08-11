import type { ShipmentLabelFinanceStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isLabelCostChargeable, labelHasSuccessfulCredit } from "@/services/shipping/label-finance";

/**
 * Outstanding shipping liability: the durable, first-class concept of "GV paid Shippo for this
 * label and has not yet recovered the cost from the seller." It is established the moment an
 * immediate clawback attempt fails (never silently dropped) and is only ever reduced by a
 * recorded recovery (`sellerRecoveredCents`) or an explicit admin write-off (`writtenOffCents`) —
 * both captured in `ShipmentLabelLiabilityRecovery` for a full audit trail.
 *
 * `ShipmentLabelFinance` remains the sole source of truth: this module only derives values from
 * it and appends recovery-attempt rows. It never writes to `Order.shippingLabelCost*`.
 */

type DbClient = Pick<typeof prisma, "shipmentLabelFinance" | "shipmentLabelLiabilityRecovery" | "order">;

export type LabelLiabilityRow = {
  id: string;
  orderId: string;
  shippoTransactionId: string;
  labelCostCents: number;
  status: ShipmentLabelFinanceStatus;
  sellerClawbackCents: number;
  sellerRecoveredCents: number;
  writtenOffCents: number;
  sellerCreditCents: number;
  sellerCreditTransferId: string | null;
};

export type LabelLiabilityDisplayStatus =
  | "recovered"
  | "partially_recovered"
  | "outstanding"
  | "refund_pending"
  | "credited"
  | "written_off";

/**
 * Amount of this label's cost still owed by the seller and not yet recovered by ANY mechanism
 * (primary immediate clawback, secondary payout-offset recovery, or admin write-off).
 * Refunded/voided/failed_purchase labels never carry chargeable cost, so they are never
 * "outstanding" — any clawback already taken on them is handled by the credit workflow instead.
 */
export function outstandingLiabilityCentsForRow(row: LabelLiabilityRow): number {
  if (!isLabelCostChargeable(row.status)) return 0;
  const covered =
    Math.max(0, row.sellerClawbackCents) +
    Math.max(0, row.sellerRecoveredCents) +
    Math.max(0, row.writtenOffCents);
  return Math.max(0, row.labelCostCents - covered);
}

/**
 * Full 6-value admin-facing status taxonomy, derived purely from ShipmentLabelFinance — never
 * persisted as its own field, so there is no risk of it drifting out of sync with the ledger.
 */
export function resolveLabelLiabilityDisplayStatus(row: LabelLiabilityRow): LabelLiabilityDisplayStatus {
  if (row.status === "refund_pending" || row.status === "void_pending") return "refund_pending";

  if (row.status === "refunded" || row.status === "voided" || row.status === "failed_purchase") {
    return labelHasSuccessfulCredit(row) ? "credited" : "recovered";
  }

  const outstanding = outstandingLiabilityCentsForRow(row);
  const writtenOff = Math.max(0, row.writtenOffCents);
  const recoveredOrClawedBack = Math.max(0, row.sellerClawbackCents) + Math.max(0, row.sellerRecoveredCents);

  if (outstanding <= 0) {
    if (writtenOff > 0 && recoveredOrClawedBack < row.labelCostCents) return "written_off";
    return "recovered";
  }
  if (recoveredOrClawedBack > 0 || writtenOff > 0) return "partially_recovered";
  return "outstanding";
}

/**
 * Mark the moment an outstanding liability was first established for this label — i.e. the first
 * time a clawback attempt did not (or could not) fully cover the chargeable label cost. Idempotent:
 * the guarded `updateMany` only ever sets this once; later successful recovery does not clear it,
 * since it is a permanent audit marker, not a live status flag.
 */
export async function markLiabilityEstablishedIfNeeded(
  financeId: string,
  db: DbClient = prisma,
): Promise<void> {
  await db.shipmentLabelFinance.updateMany({
    where: { id: financeId, liabilityEstablishedAt: null },
    data: { liabilityEstablishedAt: new Date() },
  });
}
