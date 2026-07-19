import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveReconciliationRangeStart,
  type ReconciliationRangeKey,
} from "@/lib/admin/admin-reconciliation";

export type ShippingDeductionStatus =
  | "no_label"
  | "label_purchased_pending_debit"
  | "deducted"
  | "partial"
  | "mismatch"
  | "reversal_failed"
  | "external_or_missing_transfer";

export type OrderShippingReconciliation = {
  orderId: string;
  sellerId: string;
  paymentStatus: string;
  payoutStatus: string;
  fulfillmentStatus: string;
  shippingStatus: string | null;
  liveShippingSessionId: string | null;
  buyerShippingCents: number;
  actualLabelCostCents: number | null;
  labelStatus: "none" | "purchased" | "exception";
  paidByPlatform: boolean;
  sellerDeductionCents: number;
  deductionStatus: ShippingDeductionStatus;
  netShippingVarianceCents: number;
  shippoTransactionId: string | null;
  shippingLabelCostReversalId: string | null;
  flagged: boolean;
  flagReasons: string[];
};

export type AdminShippingReconciliationReport = {
  rangeKey: ReconciliationRangeKey;
  rangeStart: string | null;
  generatedAt: string;
  orderCount: number;
  labeledOrderCount: number;
  flaggedOrderCount: number;
  buyerShippingCollectedUsd: number;
  actualLabelCostUsd: number;
  sellerDeductionUsd: number;
  unrecoveredLabelCostUsd: number;
  /** Intended platform shipping P&L: seller deductions − actual label cost (buyer shipping is seller pass-through). */
  platformShippingNetUsd: number;
  rows: OrderShippingReconciliation[];
  assumptions: string[];
};

const orderSelect = {
  id: true,
  sellerId: true,
  paymentStatus: true,
  payoutStatus: true,
  fulfillmentStatus: true,
  shippingStatus: true,
  shippingPriceUsd: true,
  shippingChargedCents: true,
  shippingLabelCostCents: true,
  shippingLabelCostReversedCents: true,
  shippingLabelCostReversalId: true,
  shippoTransactionId: true,
  labelUrl: true,
  labelCreatedAt: true,
  liveShippingSessionId: true,
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buyerShippingCentsFromOrder(o: {
  shippingChargedCents: number | null;
  shippingPriceUsd: number;
}): number {
  if (o.shippingChargedCents != null) return Math.max(0, o.shippingChargedCents);
  return Math.max(0, Math.round(o.shippingPriceUsd * 100));
}

/**
 * Build per-order shipping reconciliation.
 *
 * Intended economics:
 * - Buyer shipping is pass-through to the seller at charge time (in the Connect transfer).
 * - Platform pays Shippo for GV labels, then claws `actualLabelCost` back via transfer reversal.
 * - Platform shipping net = sellerDeduction − actualLabelCost (0 when fully recovered).
 * - Buyer shipping is NOT platform revenue.
 */
export function buildOrderShippingReconciliation(o: OrderRow): OrderShippingReconciliation {
  const buyerShippingCents = buyerShippingCentsFromOrder(o);
  const actualLabelCostCents = o.shippingLabelCostCents;
  const sellerDeductionCents = Math.max(0, o.shippingLabelCostReversedCents ?? 0);
  const hasLabelArtifact = Boolean(o.shippoTransactionId?.trim() || o.labelUrl?.trim() || o.labelCreatedAt);
  const paidByPlatform = actualLabelCostCents != null && actualLabelCostCents > 0;
  const reversalFailed = o.shippingStatus === "label_cost_reversal_failed";

  let labelStatus: OrderShippingReconciliation["labelStatus"] = "none";
  if (reversalFailed || o.fulfillmentStatus === "exception") labelStatus = "exception";
  else if (hasLabelArtifact || paidByPlatform) labelStatus = "purchased";

  let deductionStatus: ShippingDeductionStatus = "no_label";
  if (paidByPlatform || hasLabelArtifact) {
    if (reversalFailed) deductionStatus = "reversal_failed";
    else if (sellerDeductionCents <= 0 && paidByPlatform) deductionStatus = "label_purchased_pending_debit";
    else if (
      actualLabelCostCents != null &&
      sellerDeductionCents > 0 &&
      sellerDeductionCents === actualLabelCostCents
    ) {
      deductionStatus = "deducted";
    } else if (
      actualLabelCostCents != null &&
      sellerDeductionCents > 0 &&
      sellerDeductionCents < actualLabelCostCents
    ) {
      deductionStatus = "partial";
    } else if (
      actualLabelCostCents != null &&
      sellerDeductionCents > 0 &&
      sellerDeductionCents !== actualLabelCostCents
    ) {
      deductionStatus = "mismatch";
    } else if (hasLabelArtifact && !paidByPlatform) {
      deductionStatus = "external_or_missing_transfer";
    } else {
      deductionStatus = "label_purchased_pending_debit";
    }
  }

  // Platform shipping P&L ignores buyer shipping (seller pass-through).
  const netShippingVarianceCents =
    sellerDeductionCents - (actualLabelCostCents != null ? actualLabelCostCents : 0);

  const flagReasons: string[] = [];
  if (
    actualLabelCostCents != null &&
    actualLabelCostCents > 0 &&
    sellerDeductionCents !== actualLabelCostCents
  ) {
    flagReasons.push("actualLabelCostCents !== sellerShippingDeductionCents");
  }
  if (paidByPlatform && sellerDeductionCents <= 0) {
    flagReasons.push("Get Vaulted paid a valid label but no seller reimbursement exists");
  }
  if (reversalFailed) {
    flagReasons.push("shippingStatus=label_cost_reversal_failed");
  }
  if (sellerDeductionCents > 0 && (actualLabelCostCents == null || actualLabelCostCents <= 0)) {
    flagReasons.push("seller deduction recorded without label cost");
  }

  return {
    orderId: o.id,
    sellerId: o.sellerId,
    paymentStatus: o.paymentStatus,
    payoutStatus: o.payoutStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    shippingStatus: o.shippingStatus,
    liveShippingSessionId: o.liveShippingSessionId,
    buyerShippingCents,
    actualLabelCostCents,
    labelStatus,
    paidByPlatform,
    sellerDeductionCents,
    deductionStatus,
    netShippingVarianceCents,
    shippoTransactionId: o.shippoTransactionId,
    shippingLabelCostReversalId: o.shippingLabelCostReversalId,
    flagged: flagReasons.length > 0,
    flagReasons,
  };
}

export async function loadAdminShippingReconciliationReport(
  rangeKey: ReconciliationRangeKey = "30d",
  opts?: { flaggedOnly?: boolean; limit?: number },
): Promise<AdminShippingReconciliationReport> {
  const rangeStart = resolveReconciliationRangeStart(rangeKey);
  const createdAtFilter = rangeStart ? { createdAt: { gte: rangeStart } } : {};
  const limit = Math.min(Math.max(opts?.limit ?? 500, 1), 5000);

  const orders = await prisma.order.findMany({
    where: {
      ...createdAtFilter,
      paymentStatus: { in: ["paid", "layaway_completed", "refunded", "chargeback"] },
    },
    select: orderSelect,
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const allRows = orders.map(buildOrderShippingReconciliation);
  const labeled = allRows.filter((r) => r.paidByPlatform || r.labelStatus !== "none");
  const flagged = allRows.filter((r) => r.flagged);

  let buyerShippingCollectedUsd = 0;
  let actualLabelCostUsd = 0;
  let sellerDeductionUsd = 0;
  for (const r of allRows) {
    if (r.paymentStatus === "paid" || r.paymentStatus === "layaway_completed") {
      buyerShippingCollectedUsd += r.buyerShippingCents / 100;
    }
    if (r.actualLabelCostCents != null) actualLabelCostUsd += r.actualLabelCostCents / 100;
    sellerDeductionUsd += r.sellerDeductionCents / 100;
  }
  const unrecoveredLabelCostUsd = Math.max(0, actualLabelCostUsd - sellerDeductionUsd);
  const platformShippingNetUsd = sellerDeductionUsd - actualLabelCostUsd;

  const rows = (opts?.flaggedOnly ? flagged : labeled.length > 0 ? labeled : allRows.slice(0, 50))
    .slice(0, limit)
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.buyerShippingCents - a.buyerShippingCents);

  return {
    rangeKey,
    rangeStart: rangeStart ? rangeStart.toISOString() : null,
    generatedAt: new Date().toISOString(),
    orderCount: allRows.length,
    labeledOrderCount: labeled.length,
    flaggedOrderCount: flagged.length,
    buyerShippingCollectedUsd: round2(buyerShippingCollectedUsd),
    actualLabelCostUsd: round2(actualLabelCostUsd),
    sellerDeductionUsd: round2(sellerDeductionUsd),
    unrecoveredLabelCostUsd: round2(unrecoveredLabelCostUsd),
    platformShippingNetUsd: round2(platformShippingNetUsd),
    rows,
    assumptions: [
      "Buyer shipping collected at checkout is pass-through to the seller (included in the Connect transfer). It is not platform revenue.",
      "Get Vaulted pays Shippo for platform-purchased labels, then recovers actualLabelCostCents from the seller via Stripe transfer reversal (shippingLabelCostReversedCents).",
      "Intended platform shipping net = sellerDeduction − actualLabelCost. Zero when the clawback succeeds in full.",
      "Flag when actualLabelCostCents !== sellerShippingDeductionCents, or when a paid label exists with zero seller reimbursement.",
      "LiveShippingSession.finalLabelCostCents may equal the shipping estimate before any Shippo purchase — only Order.shippingLabelCostCents proves a purchased label.",
      "Bundled live labels attribute the full carrier cost to one debit order; sibling orders may show $0 label cost by design.",
    ],
  };
}
