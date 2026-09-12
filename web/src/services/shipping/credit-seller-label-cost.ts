import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import {
  buildLabelCreditIdempotencyKey,
  labelHasSuccessfulCredit,
  recalculateOrderLabelFinanceSummary,
} from "@/services/shipping/label-finance";

export type CreditSellerLabelCostResult =
  | { ok: true; creditCents: number; transferId: string | null; skipped: boolean }
  | { ok: false; code: string; error: string };

/**
 * Credit the seller for a prior label clawback (e.g. Shippo refunded a replaced label).
 * Uses a Stripe Connect Transfer to the seller account — transfer reversals are not unreversed.
 */
export async function creditSellerForLabelCost(args: {
  orderId: string;
  shippoTransactionId: string;
  creditCents?: number;
}): Promise<CreditSellerLabelCostResult> {
  const shippoTx = args.shippoTransactionId.trim();
  if (!shippoTx) {
    return { ok: false, code: "MISSING_SHIPPO_TX", error: "shippoTransactionId is required." };
  }

  const finance = await prisma.shipmentLabelFinance.findUnique({
    where: {
      orderId_shippoTransactionId: { orderId: args.orderId, shippoTransactionId: shippoTx },
    },
  });
  if (!finance) {
    return { ok: false, code: "LABEL_FINANCE_NOT_FOUND", error: "No label finance record for this Shippo transaction." };
  }

  if (labelHasSuccessfulCredit(finance)) {
    return {
      ok: true,
      creditCents: finance.sellerCreditCents,
      transferId: finance.sellerCreditTransferId,
      skipped: true,
    };
  }

  const clawbackCents = Math.max(0, finance.sellerClawbackCents);
  const creditCents = Math.max(0, Math.round(args.creditCents ?? clawbackCents));
  if (creditCents <= 0) {
    return { ok: true, creditCents: 0, transferId: null, skipped: true };
  }
  if (!finance.sellerClawbackReversalId?.trim() || clawbackCents <= 0) {
    return {
      ok: false,
      code: "NO_PRIOR_CLAWBACK",
      error: "Cannot credit seller: no successful clawback exists for this label.",
    };
  }

  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: {
      id: true,
      sellerId: true,
      stripePaymentIntentId: true,
      paymentProcessor: true,
      seller: { select: { stripeAccountId: true } },
    },
  });
  if (!order) return { ok: false, code: "ORDER_NOT_FOUND", error: "Order not found." };
  if (order.paymentProcessor !== "STRIPE") {
    return { ok: false, code: "NO_STRIPE_PAYMENT", error: "Order is not a Stripe payment." };
  }
  const destination = order.seller.stripeAccountId?.trim() || null;
  if (!destination) {
    return {
      ok: false,
      code: "SELLER_NO_CONNECT",
      error: "Seller has no Stripe Connect account for label credit transfer.",
    };
  }
  if (!isStripeConfigured()) {
    return { ok: false, code: "STRIPE_NOT_CONFIGURED", error: "Stripe is not configured." };
  }

  const idempotencyKey =
    finance.creditIdempotencyKey?.trim() ||
    buildLabelCreditIdempotencyKey({
      orderId: order.id,
      shippoTransactionId: shippoTx,
      creditCents,
    });

  // Persist idempotency key before Stripe call so a successful transfer + DB failure can be recovered.
  if (!finance.creditIdempotencyKey?.trim()) {
    await prisma.shipmentLabelFinance.update({
      where: { id: finance.id },
      data: { creditIdempotencyKey: idempotencyKey },
    });
  }

  const stripe = getStripe();
  try {
    // Preflight: platform available balance must cover the credit transfer.
    const balance = await stripe.balance.retrieve();
    const availableUsd = (balance.available ?? [])
      .filter((b) => b.currency === "usd")
      .reduce((sum, b) => sum + (b.amount ?? 0), 0);
    if (availableUsd < creditCents) {
      await prisma.shipmentLabelFinance.update({
        where: { id: finance.id },
        data: {
          creditIdempotencyKey: idempotencyKey,
          creditFailedAt: new Date(),
          creditFailureDetail: `INSUFFICIENT_PLATFORM_BALANCE availableUsdCents=${availableUsd} needed=${creditCents}`,
        },
      });
      return {
        ok: false,
        code: "INSUFFICIENT_PLATFORM_BALANCE",
        error: `Platform Stripe balance (${availableUsd}¢) is below the ${creditCents}¢ label credit.`,
      };
    }

    const transfer = await stripe.transfers.create(
      {
        amount: creditCents,
        currency: "usd",
        destination,
        description: `Get Vaulted shipping label credit for order ${order.id} (Shippo ${shippoTx})`,
        metadata: {
          orderId: order.id,
          shippoTransactionId: shippoTx,
          originalReversalId: finance.sellerClawbackReversalId ?? "",
          shipmentLabelFinanceId: finance.id,
          reason: "replaced_label_refund_credit",
          kind: "label_cost_credit",
        },
        ...(order.stripePaymentIntentId?.trim()
          ? { transfer_group: order.stripePaymentIntentId.trim() }
          : {}),
      },
      { idempotencyKey },
    );

    // Only mark credit successful after Stripe confirms the transfer id.
    await prisma.shipmentLabelFinance.update({
      where: { id: finance.id },
      data: {
        sellerCreditCents: creditCents,
        sellerCreditTransferId: transfer.id,
        creditIdempotencyKey: idempotencyKey,
        creditFailedAt: null,
        creditFailureDetail: null,
        status: finance.status === "refund_pending" || finance.status === "void_pending" ? "refunded" : finance.status,
      },
    });
    await recalculateOrderLabelFinanceSummary(order.id);

    console.info("[label_cost_credit_persisted]", {
      orderId: order.id,
      shippoTransactionId: shippoTx,
      creditCents,
      transferId: transfer.id,
      idempotencyKey,
    });

    return { ok: true, creditCents, transferId: transfer.id, skipped: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.shipmentLabelFinance.update({
      where: { id: finance.id },
      data: {
        creditIdempotencyKey: idempotencyKey,
        creditFailedAt: new Date(),
        creditFailureDetail: message.slice(0, 500),
      },
    });
    console.error("[label_cost_credit_failed]", {
      orderId: order.id,
      shippoTransactionId: shippoTx,
      creditCents,
      idempotencyKey,
      error: message,
    });
    return {
      ok: false,
      code: "CREDIT_TRANSFER_FAILED",
      error: "Could not credit seller for refunded label cost.",
    };
  }
}
