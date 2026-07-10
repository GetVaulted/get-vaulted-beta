import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { reportUrgentPaymentAnomaly } from "@/lib/cron-anomaly-alert";

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

/** Resolve the Connect transfer created by a destination-charge PaymentIntent. */
export async function resolveStripeTransferIdForPaymentIntent(
  paymentIntentId: string,
): Promise<string | null> {
  if (!isStripeConfigured()) return null;
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.transfer"],
  });
  const latestCharge = pi.latest_charge;
  if (!latestCharge || typeof latestCharge === "string") {
    if (typeof latestCharge === "string") {
      const charge = await stripe.charges.retrieve(latestCharge, { expand: ["transfer"] });
      return expandTransferId(charge.transfer);
    }
    return null;
  }
  return expandTransferId(latestCharge.transfer);
}

/**
 * After a Get Vaulted (Shippo) label is purchased, claw the label cost back from the seller's
 * Connect balance via a partial transfer reversal. Shipping remains seller pass-through at
 * payment time; external (non-GV) shipping does not call this.
 */
export async function chargeSellerForLabelCost(args: {
  orderId: string;
  labelCostCents: number;
  shippoTransactionId: string | null;
}): Promise<ChargeSellerLabelCostResult> {
  const labelCostCents = Math.max(0, Math.round(args.labelCostCents));
  if (labelCostCents <= 0) {
    return { ok: true, reversedCents: 0, reversalId: null, skipped: true };
  }

  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: {
      id: true,
      sellerId: true,
      stripePaymentIntentId: true,
      stripeTransferId: true,
      shippoTransactionId: true,
      shippingLabelCostReversalId: true,
      shippingLabelCostChargedShippoTransactionId: true,
      shippingLabelCostReversedCents: true,
      paymentProcessor: true,
    },
  });
  if (!order) {
    return { ok: false, code: "ORDER_NOT_FOUND", error: "Order not found." };
  }

  const shippoTx = args.shippoTransactionId?.trim() || null;
  // Idempotent: this Shippo transaction was already charged to the seller.
  if (
    shippoTx &&
    order.shippingLabelCostChargedShippoTransactionId === shippoTx &&
    order.shippingLabelCostReversalId
  ) {
    return {
      ok: true,
      reversedCents: order.shippingLabelCostReversedCents,
      reversalId: order.shippingLabelCostReversalId,
      skipped: true,
    };
  }

  if (order.paymentProcessor !== "STRIPE" || !order.stripePaymentIntentId?.trim()) {
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

  const idempotencyKey = `label_cost_${order.id}_${shippoTx || "nolabel"}_${labelCostCents}`;

  try {
    const reversal = await stripe.transfers.createReversal(
      transferId,
      { amount: labelCostCents, description: `Get Vaulted shipping label cost for order ${order.id}` },
      { idempotencyKey },
    );

    const nextReversed = Math.max(0, order.shippingLabelCostReversedCents) + labelCostCents;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        stripeTransferId: transferId,
        shippingLabelCostReversalId: reversal.id,
        shippingLabelCostChargedShippoTransactionId: shippoTx,
        shippingLabelCostReversedCents: nextReversed,
      },
    });

    return { ok: true, reversedCents: nextReversed, reversalId: reversal.id, skipped: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[chargeSellerForLabelCost] reversal failed", {
      orderId: order.id,
      transferId,
      labelCostCents,
      error: message,
    });
    void reportUrgentPaymentAnomaly(
      "label_cost_reversal_failed",
      `order=${order.id} seller=${order.sellerId} transfer=${transferId} labelCostCents=${labelCostCents} error=${message}`,
    );
    return {
      ok: false,
      code: "REVERSAL_FAILED",
      error:
        "Label was purchased, but we could not deduct the carrier cost from your payout (Stripe balance may be insufficient). Support has been notified.",
    };
  }
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
