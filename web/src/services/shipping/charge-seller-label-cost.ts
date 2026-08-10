import type { ShipmentLabelFinancePurpose } from "@/generated/prisma/client";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { reportUrgentPaymentAnomaly } from "@/lib/cron-anomaly-alert";
import {
  buildLabelClawbackIdempotencyKey,
  inferLabelPurpose,
  labelHasSuccessfulClawback,
  recalculateOrderLabelFinanceSummary,
} from "@/services/shipping/label-finance";
import {
  financeStatusFromShippoVerdict,
  verifyShippoLabelRefundStatus,
} from "@/services/shipping/shippo-label-refund-status";
import { creditSellerForLabelCost } from "@/services/shipping/credit-seller-label-cost";
import { isStripeBankPayoutId } from "@/services/payout/stripe-seller-payout";

export type ChargeSellerLabelCostResult =
  | { ok: true; reversedCents: number; reversalId: string | null; skipped: boolean }
  | { ok: false; code: string; error: string };

function expandTransferId(raw: unknown): string | null {
  if (typeof raw === "string" && raw.startsWith("tr_")) return raw;
  if (raw && typeof raw === "object" && "id" in raw) {
    const id = (raw as { id?: unknown }).id;
    if (typeof id === "string" && id.startsWith("tr_")) return id;
  }
  return null;
}

/**
 * Resolve the Connect transfer created by a destination-charge PaymentIntent.
 * Prefer charge.transfer; fall back to transfers list filtered by source_transaction (charge id).
 */
export async function resolveStripeTransferIdForPaymentIntent(
  paymentIntentId: string,
): Promise<string | null> {
  if (!isStripeConfigured()) return null;
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.transfer"],
  });

  let chargeId: string | null = null;
  let fromCharge: string | null = null;

  const latestCharge = pi.latest_charge;
  if (typeof latestCharge === "string" && latestCharge.startsWith("ch_")) {
    chargeId = latestCharge;
    const charge = await stripe.charges.retrieve(latestCharge, { expand: ["transfer"] });
    fromCharge = expandTransferId(charge.transfer);
  } else if (latestCharge && typeof latestCharge === "object") {
    chargeId = latestCharge.id?.startsWith("ch_") ? latestCharge.id : null;
    fromCharge = expandTransferId(latestCharge.transfer);
  }

  if (fromCharge) return fromCharge;

  // Destination charges sometimes omit expanded transfer on the charge; look up by source charge.
  if (!chargeId) return null;
  try {
    const bySource = await stripe.transfers.list({
      limit: 20,
      // Stripe Transfer list supports source_transaction for destination-charge auto transfers.
      source_transaction: chargeId,
    } as Parameters<typeof stripe.transfers.list>[0] & { source_transaction: string });
    const hit = bySource.data.find((t) => typeof t.id === "string" && t.id.startsWith("tr_"));
    return hit?.id ?? null;
  } catch (e) {
    console.warn("[resolveStripeTransferIdForPaymentIntent] source_transaction lookup failed", {
      paymentIntentId,
      chargeId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export type ChargeSellerLabelCostArgs = {
  orderId: string;
  labelCostCents: number;
  shippoTransactionId: string | null;
  shippoShipmentId?: string | null;
  shipmentPackageId?: string | null;
  liveShippingSessionId?: string | null;
  purpose?: ShipmentLabelFinancePurpose | null;
  replacesShippoTransactionId?: string | null;
  packageIndex?: number | null;
  /** When true, skip replacement prior-label Shippo/credit side-effects (tests / backfill). */
  skipReplacementWorkflow?: boolean;
  /**
   * When true, skip Shippo SUCCESS purchase proof (unit tests only).
   * Production callers must leave this unset — clawback requires affirmative purchase evidence.
   */
  skipPurchaseSuccessCheck?: boolean;
};

/**
 * After a Get Vaulted (Shippo) label is purchased, claw the label cost back from the seller's
 * Connect balance via a partial transfer reversal — idempotent per Shippo transaction.
 *
 * Replacement vs additional package is distinguished via purpose / replacesShippoTransactionId.
 * Do not blindly charge only a delta against Order.shippingLabelCostReversedCents.
 */
export async function chargeSellerForLabelCost(
  args: ChargeSellerLabelCostArgs,
): Promise<ChargeSellerLabelCostResult> {
  const labelCostCents = Math.max(0, Math.round(args.labelCostCents));
  if (labelCostCents <= 0) {
    return { ok: true, reversedCents: 0, reversalId: null, skipped: true };
  }

  const shippoTx = args.shippoTransactionId?.trim() || null;
  if (!shippoTx) {
    return {
      ok: false,
      code: "MISSING_SHIPPO_TX",
      error: "Cannot deduct label cost without a Shippo transaction id.",
    };
  }

  const replacesTx = args.replacesShippoTransactionId?.trim() || null;

  // 1) Locate/create the per-transaction finance record under a short transactional lock.
  const prepared = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${args.orderId} FOR UPDATE`;

    const order = await tx.order.findUnique({
      where: { id: args.orderId },
      select: {
        id: true,
        sellerId: true,
        stripePaymentIntentId: true,
        stripeTransferId: true,
        paymentProcessor: true,
        sellerPayoutProcessor: true,
        processorTransferId: true,
        payoutStatus: true,
        shippingLabelCostReversedCents: true,
        shippingLabelCostReversalId: true,
        shippingLabelCostChargedShippoTransactionId: true,
      },
    });
    if (!order) return { kind: "missing_order" as const };

    if (isStripeBankPayoutId(order.processorTransferId)) {
      return { kind: "bank_already_paid" as const, order };
    }

    const existing = await tx.shipmentLabelFinance.findUnique({
      where: {
        orderId_shippoTransactionId: { orderId: order.id, shippoTransactionId: shippoTx },
      },
    });

    // Bundled-label debit failover (see bundled-labels.ts) retries the SAME package + Shippo
    // transaction against a DIFFERENT orderId when the first order's Stripe reversal fails.
    // shipmentPackageId is a hard one-row-per-package unique constraint, so a naive create()
    // on retry collides with the row the failed first attempt already persisted. Look that row
    // up so we can reuse/release it instead of crashing on the unique constraint.
    const existingForPackage =
      !existing && args.shipmentPackageId?.trim()
        ? await tx.shipmentLabelFinance.findUnique({
            where: { shipmentPackageId: args.shipmentPackageId.trim() },
          })
        : null;

    if (existing && labelHasSuccessfulClawback(existing)) {
      const summary = await recalculateOrderLabelFinanceSummary(order.id, tx);
      return {
        kind: "already_charged" as const,
        order,
        financeId: existing.id,
        summary,
        reversalId: existing.sellerClawbackReversalId,
      };
    }

    // Bundled live shipping: one Shippo label may appear on many session orders. Never reverse twice.
    const priorClawback = await tx.shipmentLabelFinance.findFirst({
      where: {
        shippoTransactionId: shippoTx,
        sellerClawbackReversalId: { not: null },
        sellerClawbackCents: { gt: 0 },
      },
      select: {
        orderId: true,
        sellerClawbackCents: true,
        sellerClawbackReversalId: true,
      },
    });
    if (priorClawback?.sellerClawbackReversalId) {
      return {
        kind: "already_charged_elsewhere" as const,
        order,
        priorOrderId: priorClawback.orderId,
        reversedCents: priorClawback.sellerClawbackCents,
        reversalId: priorClawback.sellerClawbackReversalId,
      };
    }

    const priorCount = await tx.shipmentLabelFinance.count({
      where: {
        orderId: order.id,
        status: { in: ["active", "replaced", "refund_pending", "void_pending"] },
        NOT: { shippoTransactionId: shippoTx },
      },
    });
    const purpose = inferLabelPurpose({
      purpose: args.purpose,
      replacesShippoTransactionId: replacesTx,
      existingActiveOrReplacedCount: priorCount,
      packageIndex: args.packageIndex,
    });

    const clawbackIdempotencyKey = buildLabelClawbackIdempotencyKey({
      orderId: order.id,
      shippoTransactionId: shippoTx,
      labelCostCents,
    });

    let finance;
    if (existing) {
      finance = await tx.shipmentLabelFinance.update({
        where: { id: existing.id },
        data: {
          labelCostCents,
          shippoShipmentId: args.shippoShipmentId?.trim() || existing.shippoShipmentId,
          shipmentPackageId: args.shipmentPackageId?.trim() || existing.shipmentPackageId,
          liveShippingSessionId: args.liveShippingSessionId?.trim() || existing.liveShippingSessionId,
          purpose,
          replacesShippoTransactionId: replacesTx || existing.replacesShippoTransactionId,
          clawbackIdempotencyKey,
          status: existing.status === "replaced" ? existing.status : "active",
        },
      });
    } else if (existingForPackage && existingForPackage.shippoTransactionId === shippoTx) {
      // Same package + same Shippo transaction, just being retried against a new debit order
      // after the first order's reversal failed — re-point the existing row rather than
      // creating a duplicate that would collide on shipmentPackageId.
      finance = await tx.shipmentLabelFinance.update({
        where: { id: existingForPackage.id },
        data: {
          orderId: order.id,
          labelCostCents,
          shippoShipmentId: args.shippoShipmentId?.trim() || existingForPackage.shippoShipmentId,
          liveShippingSessionId:
            args.liveShippingSessionId?.trim() || existingForPackage.liveShippingSessionId,
          purpose,
          replacesShippoTransactionId: replacesTx || existingForPackage.replacesShippoTransactionId,
          clawbackIdempotencyKey,
          status: existingForPackage.status === "replaced" ? existingForPackage.status : "active",
        },
      });
    } else {
      if (existingForPackage) {
        // A different Shippo transaction now owns this package (e.g. a reprint not linked via
        // replacesShippoTransactionId). Release the stale pointer so create() below doesn't
        // collide — history stays on the old row, it just no longer claims the package.
        await tx.shipmentLabelFinance.update({
          where: { id: existingForPackage.id },
          data: { shipmentPackageId: null },
        });
      }
      finance = await tx.shipmentLabelFinance.create({
        data: {
          orderId: order.id,
          liveShippingSessionId: args.liveShippingSessionId?.trim() || null,
          shipmentPackageId: args.shipmentPackageId?.trim() || null,
          shippoTransactionId: shippoTx,
          shippoShipmentId: args.shippoShipmentId?.trim() || null,
          labelCostCents,
          purpose,
          replacesShippoTransactionId: replacesTx,
          status: "active",
          clawbackIdempotencyKey,
        },
      });
    }

    return { kind: "ready" as const, order, finance, purpose, clawbackIdempotencyKey };
  });

  if (prepared.kind === "missing_order") {
    return { ok: false, code: "ORDER_NOT_FOUND", error: "Order not found." };
  }

  if (prepared.kind === "bank_already_paid") {
    return {
      ok: false,
      code: "BANK_PAYOUT_ALREADY_SENT",
      error:
        "Seller bank payout already sent for this order; cannot reverse label cost from Connect. Flag for manual review.",
    };
  }

  if (prepared.kind === "already_charged") {
    console.info("[label_cost_charge_skipped_idempotent]", {
      orderId: args.orderId,
      shippoTransactionId: shippoTx,
      reversalId: prepared.reversalId,
      netSellerDeductionCents: prepared.summary.shippingLabelCostReversedCents,
    });
    return {
      ok: true,
      reversedCents: prepared.summary.shippingLabelCostReversedCents,
      reversalId: prepared.reversalId,
      skipped: true,
    };
  }

  if (prepared.kind === "already_charged_elsewhere") {
    console.info("[label_cost_charge_skipped_shippo_already_clawed]", {
      orderId: args.orderId,
      shippoTransactionId: shippoTx,
      clawedOnOrderId: prepared.priorOrderId,
      reversalId: prepared.reversalId,
      reversedCents: prepared.reversedCents,
    });
    return {
      ok: true,
      reversedCents: prepared.reversedCents,
      reversalId: prepared.reversalId,
      skipped: true,
    };
  }

  const { order, finance, purpose, clawbackIdempotencyKey } = prepared;

  console.info("[label_cost_charge_attempt]", {
    orderId: order.id,
    sellerId: order.sellerId,
    shippoTransactionId: shippoTx,
    labelCostCents,
    purpose,
    replacesShippoTransactionId: replacesTx,
    financeId: finance.id,
    priorOrderReversedCents: order.shippingLabelCostReversedCents,
    note: "Idempotent per Shippo transaction; order summary recalculated from label finance rows.",
  });

  // Hard gate: never claw back unless Shippo proves an affirmative successful purchase.
  if (!args.skipPurchaseSuccessCheck) {
    const purchaseEvidence = await verifyShippoLabelRefundStatus(shippoTx);
    if (purchaseEvidence.verdict !== "chargeable") {
      const status =
        purchaseEvidence.verdict === "failed_purchase"
          ? "failed_purchase"
          : financeStatusFromShippoVerdict(purchaseEvidence.verdict);
      const raw = purchaseEvidence.rawTransaction as Record<string, unknown> | undefined;
      const objectState =
        raw && typeof raw.object_state === "string" ? String(raw.object_state) : null;
      await prisma.shipmentLabelFinance.update({
        where: { id: finance.id },
        data: {
          status: status === "replaced" ? "active" : status,
          labelCostCents: 0,
          quotedLabelCostCents: labelCostCents,
          clawbackFailedAt: new Date(),
          clawbackFailureDetail: `SHIPPO_PURCHASE_NOT_SUCCESSFUL verdict=${purchaseEvidence.verdict}`,
          shippoStatus: purchaseEvidence.transactionStatus,
          shippoObjectState: objectState,
          shippoMessagesJson:
            purchaseEvidence.messages?.length ? purchaseEvidence.messages : undefined,
        },
      });
      await recalculateOrderLabelFinanceSummary(order.id);
      return {
        ok: false,
        code: "SHIPPO_PURCHASE_NOT_SUCCESSFUL",
        error: `Cannot deduct label cost: Shippo transaction is ${purchaseEvidence.verdict}, not an affirmative SUCCESS purchase.`,
      };
    }
  }

  // 2) Replacement workflow: classify prior label; credit only when Shippo confirms refund/void.
  if (!args.skipReplacementWorkflow && purpose === "replacement" && replacesTx) {
    await applyReplacementPriorLabelWorkflow({
      orderId: order.id,
      replacesShippoTransactionId: replacesTx,
    });
  }

  if (order.sellerPayoutProcessor === "PAYPAL") {
    // Platform-held PayPal rail: net label cost from upcoming PayPal payout (no Connect reversal).
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
      await tx.shipmentLabelFinance.update({
        where: { id: finance.id },
        data: {
          sellerClawbackCents: labelCostCents,
          sellerClawbackReversalId: `paypal-net:${shippoTx}`,
          clawbackIdempotencyKey,
          clawbackFailedAt: null,
          clawbackFailureDetail: null,
        },
      });
      await recalculateOrderLabelFinanceSummary(order.id, tx);
      await tx.order.update({
        where: { id: order.id },
        data: {
          shippingLabelCostReversedCents: {
            increment: labelCostCents,
          },
          shippingLabelCostChargedShippoTransactionId: shippoTx,
        },
      });
    });
    return {
      ok: true,
      reversedCents: labelCostCents,
      reversalId: `paypal-net:${shippoTx}`,
      skipped: false,
    };
  }

  if (order.paymentProcessor !== "STRIPE" || !order.stripePaymentIntentId?.trim()) {
    await prisma.shipmentLabelFinance.update({
      where: { id: finance.id },
      data: {
        clawbackFailedAt: new Date(),
        clawbackFailureDetail: "NO_STRIPE_PAYMENT",
      },
    });
    return {
      ok: false,
      code: "NO_STRIPE_PAYMENT",
      error: "Cannot deduct label cost: this order has no Stripe payment to reverse against.",
    };
  }

  if (!isStripeConfigured()) {
    return {
      ok: false,
      code: "STRIPE_NOT_CONFIGURED",
      error: "Stripe is not configured; cannot deduct label cost from seller payout.",
    };
  }

  const stripe = getStripe();
  let transferId = order.stripeTransferId?.trim() || null;
  if (!transferId) {
    try {
      transferId = await resolveStripeTransferIdForPaymentIntent(order.stripePaymentIntentId.trim());
    } catch (e) {
      console.error("[chargeSellerForLabelCost] resolve transfer failed", {
        orderId: order.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        ok: false,
        code: "TRANSFER_LOOKUP_FAILED",
        error: "Could not find the Stripe transfer for this order to deduct the label cost.",
      };
    }
  }
  if (!transferId) {
    return {
      ok: false,
      code: "TRANSFER_NOT_FOUND",
      error: "No Stripe transfer found for this order; cannot deduct label cost from seller payout.",
    };
  }

  if (!order.stripeTransferId || order.stripeTransferId !== transferId) {
    await prisma.order.update({
      where: { id: order.id },
      data: { stripeTransferId: transferId },
    });
  }

  try {
    const reversal = await stripe.transfers.createReversal(
      transferId,
      {
        amount: labelCostCents,
        description: `Get Vaulted shipping label cost for order ${order.id} (${shippoTx})`,
      },
      { idempotencyKey: clawbackIdempotencyKey },
    );

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
      await tx.shipmentLabelFinance.update({
        where: { id: finance.id },
        data: {
          sellerClawbackCents: labelCostCents,
          sellerClawbackReversalId: reversal.id,
          clawbackIdempotencyKey,
          clawbackFailedAt: null,
          clawbackFailureDetail: null,
        },
      });
      await recalculateOrderLabelFinanceSummary(order.id, tx);
      await tx.order.update({
        where: { id: order.id },
        data: { stripeTransferId: transferId },
      });
    });

    const summary = await recalculateOrderLabelFinanceSummary(order.id);

    console.info("[label_cost_charge_persisted]", {
      orderId: order.id,
      shippoTransactionId: shippoTx,
      labelCostCents,
      stripeReversalId: reversal.id,
      netSellerDeductionCents: summary.shippingLabelCostReversedCents,
      chargeableLabelCostCents: summary.shippingLabelCostCents,
      idempotencyKey: clawbackIdempotencyKey,
    });

    return {
      ok: true,
      reversedCents: summary.shippingLabelCostReversedCents,
      reversalId: reversal.id,
      skipped: false,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.shipmentLabelFinance.update({
      where: { id: finance.id },
      data: {
        clawbackFailedAt: new Date(),
        clawbackFailureDetail: message.slice(0, 500),
        clawbackIdempotencyKey,
      },
    });
    console.error("[label_cost_charge_failed]", {
      orderId: order.id,
      transferId,
      shippoTransactionId: shippoTx,
      labelCostCents,
      idempotencyKey: clawbackIdempotencyKey,
      error: message,
    });
    void reportUrgentPaymentAnomaly(
      "label_cost_reversal_failed",
      `order=${order.id} seller=${order.sellerId} transfer=${transferId} labelCostCents=${labelCostCents} shippoTx=${shippoTx} error=${message}`,
    );
    return {
      ok: false,
      code: "REVERSAL_FAILED",
      error:
        `Label was purchased, but Stripe could not reverse $${(labelCostCents / 100).toFixed(2)} from the seller transfer (${transferId}). ${message.slice(0, 280)}`,
    };
  }
}

/**
 * When a replacement label is purchased:
 * - Mark which prior label it replaces
 * - Verify Shippo void/refund (do not assume refund)
 * - Credit seller only when prior label is successfully refunded/voided
 * - Leave pending/unknown as refund_pending for reconciliation
 */
export async function applyReplacementPriorLabelWorkflow(args: {
  orderId: string;
  replacesShippoTransactionId: string;
}): Promise<{
  priorFinanceId: string | null;
  verdict: string;
  credited: boolean;
}> {
  const replacesTx = args.replacesShippoTransactionId.trim();
  const prior = await prisma.shipmentLabelFinance.findUnique({
    where: {
      orderId_shippoTransactionId: { orderId: args.orderId, shippoTransactionId: replacesTx },
    },
  });
  if (!prior) {
    console.warn("[label_replacement_prior_missing]", {
      orderId: args.orderId,
      replacesShippoTransactionId: replacesTx,
    });
    return { priorFinanceId: null, verdict: "missing_prior_record", credited: false };
  }

  const evidence = await verifyShippoLabelRefundStatus(replacesTx);
  const nextStatus = financeStatusFromShippoVerdict(evidence.verdict);

  await prisma.shipmentLabelFinance.update({
    where: { id: prior.id },
    data: { status: nextStatus },
  });

  console.info("[label_replacement_prior_classified]", {
    orderId: args.orderId,
    priorFinanceId: prior.id,
    replacesShippoTransactionId: replacesTx,
    shippoVerdict: evidence.verdict,
    transactionStatus: evidence.transactionStatus,
    refundStatuses: evidence.refundStatuses,
    nextStatus,
  });

  let credited = false;
  if (evidence.verdict === "refunded" && labelHasSuccessfulClawback(prior) && !prior.sellerCreditTransferId) {
    const credit = await creditSellerForLabelCost({
      orderId: args.orderId,
      shippoTransactionId: replacesTx,
      creditCents: prior.sellerClawbackCents,
    });
    credited = credit.ok && !credit.skipped ? true : Boolean(credit.ok && credit.skipped);
    if (!credit.ok) {
      console.error("[label_replacement_prior_credit_failed]", {
        orderId: args.orderId,
        replacesShippoTransactionId: replacesTx,
        code: credit.code,
        error: credit.error,
      });
    }
  }

  await recalculateOrderLabelFinanceSummary(args.orderId);
  return { priorFinanceId: prior.id, verdict: evidence.verdict, credited };
}

/** Mark order fulfillment as needing support after label purchase succeeded but seller debit failed. */
export async function markOrderLabelCostReversalFailed(orderId: string): Promise<void> {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      fulfillmentStatus: "exception",
      shippingStatus: "label_cost_reversal_failed",
    },
  });
}
