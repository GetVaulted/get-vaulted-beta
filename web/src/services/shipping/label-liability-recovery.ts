import type { ShipmentLabelLiabilityRecoveryMethod } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { outstandingLiabilityCentsForRow, type LabelLiabilityRow } from "@/services/shipping/label-liability";

/**
 * Recover outstanding shipping liability by offsetting it against money about to leave the
 * platform for the seller (a bank/PayPal payout), rather than issuing a second, separate charge.
 * Two-phase by design:
 *   1. `planOutstandingLiabilityRecoveryForSeller` — pure read, computes what WOULD be recovered.
 *   2. `applyOutstandingLiabilityRecovery` — writes, called ONLY after the (possibly-reduced)
 *      payout itself has actually been confirmed sent (or, when it fully absorbs the payout,
 *      confirmed withheld) — so a recovery is never recorded for money that didn't move.
 * Idempotent per (shipmentLabelFinanceId, transactionId): a retried payout release with the same
 * processor transaction id can safely re-plan and re-apply without double-recovering.
 */

type DbClient = Pick<typeof prisma, "shipmentLabelFinance" | "shipmentLabelLiabilityRecovery">;

export type LiabilityRecoveryPlanItem = {
  shipmentLabelFinanceId: string;
  orderId: string;
  shippoTransactionId: string;
  amountCents: number;
};

export type LiabilityRecoveryPlan = {
  sellerId: string;
  items: LiabilityRecoveryPlanItem[];
  totalCents: number;
};

const RECOVERABLE_STATUSES = ["active", "replaced"] as const;

/**
 * FIFO plan (oldest outstanding liability first) capped at `availableCents` — never plans more
 * than the payout actually about to be sent. Read-only; does not write anything.
 */
export async function planOutstandingLiabilityRecoveryForSeller(
  sellerId: string,
  availableCents: number,
  db: DbClient = prisma,
): Promise<LiabilityRecoveryPlan> {
  if (!sellerId.trim() || availableCents <= 0) return { sellerId, items: [], totalCents: 0 };

  const rows = await db.shipmentLabelFinance.findMany({
    where: {
      order: { sellerId },
      status: { in: [...RECOVERABLE_STATUSES] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderId: true,
      shippoTransactionId: true,
      labelCostCents: true,
      status: true,
      sellerClawbackCents: true,
      sellerRecoveredCents: true,
      writtenOffCents: true,
      sellerCreditCents: true,
      sellerCreditTransferId: true,
    },
  });

  let remaining = availableCents;
  const items: LiabilityRecoveryPlanItem[] = [];
  for (const row of rows as LabelLiabilityRow[]) {
    if (remaining <= 0) break;
    const outstanding = outstandingLiabilityCentsForRow(row);
    if (outstanding <= 0) continue;
    const apply = Math.min(outstanding, remaining);
    items.push({
      shipmentLabelFinanceId: row.id,
      orderId: row.orderId,
      shippoTransactionId: row.shippoTransactionId,
      amountCents: apply,
    });
    remaining -= apply;
  }

  return { sellerId, items, totalCents: availableCents - remaining };
}

/**
 * Apply a previously-computed plan, recording each recovered amount on its
 * ShipmentLabelFinance row and appending an audit-trail ShipmentLabelLiabilityRecovery row.
 * Safe to call more than once with the same `transactionId` — already-recorded items are skipped.
 */
export async function applyOutstandingLiabilityRecovery(
  plan: LiabilityRecoveryPlan,
  args: { method: ShipmentLabelLiabilityRecoveryMethod; transactionId: string },
  db: typeof prisma = prisma,
): Promise<{ appliedCents: number; skippedCount: number }> {
  if (plan.items.length === 0) return { appliedCents: 0, skippedCount: 0 };

  let appliedCents = 0;
  let skippedCount = 0;

  await db.$transaction(async (tx) => {
    for (const item of plan.items) {
      const already = await tx.shipmentLabelLiabilityRecovery.findFirst({
        where: { shipmentLabelFinanceId: item.shipmentLabelFinanceId, transactionId: args.transactionId },
        select: { id: true },
      });
      if (already) {
        skippedCount += 1;
        continue;
      }

      await tx.shipmentLabelFinance.update({
        where: { id: item.shipmentLabelFinanceId },
        data: { sellerRecoveredCents: { increment: item.amountCents } },
      });
      await tx.shipmentLabelLiabilityRecovery.create({
        data: {
          shipmentLabelFinanceId: item.shipmentLabelFinanceId,
          sellerId: plan.sellerId,
          method: args.method,
          outcome: "recovered",
          amountCents: item.amountCents,
          transactionId: args.transactionId,
          detail: `orderId=${item.orderId} shippoTransactionId=${item.shippoTransactionId}`,
        },
      });
      appliedCents += item.amountCents;
    }
  });

  return { appliedCents, skippedCount };
}
