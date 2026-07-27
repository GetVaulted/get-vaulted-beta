import type {
  ShipmentLabelFinance,
  ShipmentLabelFinancePurpose,
  ShipmentLabelFinanceStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type LabelFinanceRow = Pick<
  ShipmentLabelFinance,
  | "id"
  | "orderId"
  | "shippoTransactionId"
  | "shippoShipmentId"
  | "labelCostCents"
  | "purpose"
  | "replacesShippoTransactionId"
  | "status"
  | "sellerClawbackCents"
  | "sellerClawbackReversalId"
  | "sellerCreditCents"
  | "sellerCreditTransferId"
  | "clawbackIdempotencyKey"
  | "creditIdempotencyKey"
>;

/** Labels that still cost the platform (purchased and not voided/refunded/failed). */
export function isLabelCostChargeable(status: ShipmentLabelFinanceStatus): boolean {
  return (
    status !== "refunded" &&
    status !== "voided" &&
    status !== "failed_purchase"
  );
}

export function buildFailedLabelClawbackRepairIdempotencyKey(orderId: string, totalCreditCents: number): string {
  return `failed_label_clawback_credit_${orderId}_${totalCreditCents}`;
}

export function labelHasSuccessfulClawback(row: Pick<LabelFinanceRow, "sellerClawbackCents" | "sellerClawbackReversalId">): boolean {
  return Boolean(row.sellerClawbackReversalId?.trim()) && Math.max(0, row.sellerClawbackCents) > 0;
}

export function labelHasSuccessfulCredit(row: Pick<LabelFinanceRow, "sellerCreditCents" | "sellerCreditTransferId">): boolean {
  return Boolean(row.sellerCreditTransferId?.trim()) && Math.max(0, row.sellerCreditCents) > 0;
}

export function labelNetSellerCents(row: Pick<LabelFinanceRow, "sellerClawbackCents" | "sellerCreditCents">): number {
  return Math.max(0, row.sellerClawbackCents) - Math.max(0, row.sellerCreditCents);
}

export function buildLabelClawbackIdempotencyKey(args: {
  orderId: string;
  shippoTransactionId: string;
  labelCostCents: number;
}): string {
  // Key by Shippo transaction (not order). Bundled live sessions share one label across many
  // orders — including orderId would allow double Stripe reversals for the same label.
  void args.orderId;
  return `label_clawback_${args.shippoTransactionId}_${args.labelCostCents}`;
}

export function buildLabelCreditIdempotencyKey(args: {
  orderId: string;
  shippoTransactionId: string;
  creditCents: number;
}): string {
  return `label_credit_${args.orderId}_${args.shippoTransactionId}_${args.creditCents}`;
}

export function summarizeLabelFinanceRows(rows: LabelFinanceRow[]): {
  chargeableLabelCostCents: number;
  grossSellerClawbackCents: number;
  sellerCreditCents: number;
  netSellerDeductionCents: number;
  latestClawbackReversalId: string | null;
  latestChargedShippoTransactionId: string | null;
  hasRefundPending: boolean;
  labelsMissingClawback: LabelFinanceRow[];
  labelsNeedingCredit: LabelFinanceRow[];
} {
  let chargeableLabelCostCents = 0;
  let grossSellerClawbackCents = 0;
  let sellerCreditCents = 0;
  let latestClawbackReversalId: string | null = null;
  let latestChargedShippoTransactionId: string | null = null;
  let hasRefundPending = false;
  const labelsMissingClawback: LabelFinanceRow[] = [];
  const labelsNeedingCredit: LabelFinanceRow[] = [];

  for (const row of rows) {
    if (isLabelCostChargeable(row.status)) {
      chargeableLabelCostCents += Math.max(0, row.labelCostCents);
    }
    grossSellerClawbackCents += Math.max(0, row.sellerClawbackCents);
    sellerCreditCents += Math.max(0, row.sellerCreditCents);
    if (row.status === "refund_pending" || row.status === "void_pending") {
      hasRefundPending = true;
    }
    if (isLabelCostChargeable(row.status) && !labelHasSuccessfulClawback(row)) {
      labelsMissingClawback.push(row);
    }
    // Refunded/voided/failed_purchase labels that were clawed back must be credited (unless already credited).
    if (
      (row.status === "refunded" || row.status === "voided" || row.status === "failed_purchase") &&
      labelHasSuccessfulClawback(row) &&
      !labelHasSuccessfulCredit(row)
    ) {
      labelsNeedingCredit.push(row);
    }
    if (row.sellerClawbackReversalId?.trim()) {
      latestClawbackReversalId = row.sellerClawbackReversalId.trim();
      latestChargedShippoTransactionId = row.shippoTransactionId;
    }
  }

  return {
    chargeableLabelCostCents,
    grossSellerClawbackCents,
    sellerCreditCents,
    netSellerDeductionCents: Math.max(0, grossSellerClawbackCents - sellerCreditCents),
    latestClawbackReversalId,
    latestChargedShippoTransactionId,
    hasRefundPending,
    labelsMissingClawback,
    labelsNeedingCredit,
  };
}

type DbClient = Pick<typeof prisma, "shipmentLabelFinance" | "order">;

/** Recalculate Order summary fields from label-level finance rows. */
export async function recalculateOrderLabelFinanceSummary(
  orderId: string,
  db: DbClient = prisma,
): Promise<{
  shippingLabelCostCents: number;
  shippingLabelCostReversedCents: number;
  shippingLabelCostReversalId: string | null;
  shippingLabelCostChargedShippoTransactionId: string | null;
}> {
  const rows = await db.shipmentLabelFinance.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderId: true,
      shippoTransactionId: true,
      shippoShipmentId: true,
      labelCostCents: true,
      purpose: true,
      replacesShippoTransactionId: true,
      status: true,
      sellerClawbackCents: true,
      sellerClawbackReversalId: true,
      sellerCreditCents: true,
      sellerCreditTransferId: true,
      clawbackIdempotencyKey: true,
      creditIdempotencyKey: true,
    },
  });

  const summary = summarizeLabelFinanceRows(rows);
  await db.order.update({
    where: { id: orderId },
    data: {
      shippingLabelCostCents: summary.chargeableLabelCostCents > 0 ? summary.chargeableLabelCostCents : null,
      shippingLabelCostReversedCents: summary.netSellerDeductionCents,
      shippingLabelCostReversalId: summary.latestClawbackReversalId,
      shippingLabelCostChargedShippoTransactionId: summary.latestChargedShippoTransactionId,
    },
  });

  return {
    shippingLabelCostCents: summary.chargeableLabelCostCents,
    shippingLabelCostReversedCents: summary.netSellerDeductionCents,
    shippingLabelCostReversalId: summary.latestClawbackReversalId,
    shippingLabelCostChargedShippoTransactionId: summary.latestChargedShippoTransactionId,
  };
}

export function inferLabelPurpose(args: {
  purpose?: ShipmentLabelFinancePurpose | null;
  replacesShippoTransactionId?: string | null;
  existingActiveOrReplacedCount: number;
  packageIndex?: number | null;
}): ShipmentLabelFinancePurpose {
  if (args.purpose) return args.purpose;
  if (args.replacesShippoTransactionId?.trim()) return "replacement";
  if ((args.packageIndex ?? 0) > 0) return "additional_package";
  if (args.existingActiveOrReplacedCount > 0) return "additional_package";
  return "initial";
}

export type LabelFinanceActionStatus =
  | "seller_charge_required"
  | "seller_credit_required"
  | "waiting_for_shippo_refund"
  | "reconciled_multiple_labels"
  | "reconciled"
  | "overcharge";

export function resolveLabelFinanceActionStatus(summary: ReturnType<typeof summarizeLabelFinanceRows> & {
  labelCount: number;
}): LabelFinanceActionStatus {
  if (summary.labelsNeedingCredit.length > 0) return "seller_credit_required";
  if (summary.hasRefundPending) return "waiting_for_shippo_refund";
  if (summary.labelsMissingClawback.length > 0) return "seller_charge_required";
  const net = summary.netSellerDeductionCents;
  const chargeable = summary.chargeableLabelCostCents;
  if (net > chargeable) return "overcharge";
  if (net === chargeable && summary.labelCount > 1) return "reconciled_multiple_labels";
  if (net === chargeable) return "reconciled";
  if (net < chargeable) return "seller_charge_required";
  return "reconciled";
}
