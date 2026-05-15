import type Stripe from "stripe";
import { OrderPaymentMethod } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/**
 * PaymentIntent `metadata.kind` values that may finalize or fail a marketplace `Order`.
 * Other kinds (e.g. `break_spot`) must not drive order finalization from PI webhooks.
 */
export const MARKETPLACE_ORDER_PAYMENT_INTENT_KINDS = ["buy_now", "pay_order", "pay_order_saved_pm"] as const;

export type MarketplaceOrderPaymentIntentKind = (typeof MARKETPLACE_ORDER_PAYMENT_INTENT_KINDS)[number];

export function isMarketplaceOrderPaymentIntentKind(
  raw: string | null | undefined,
): raw is MarketplaceOrderPaymentIntentKind {
  const k = raw?.trim();
  return Boolean(k && (MARKETPLACE_ORDER_PAYMENT_INTENT_KINDS as readonly string[]).includes(k));
}

export function logIgnoredMarketplacePaymentIntentWebhook(
  eventType: string,
  reason: string,
  ctx: { paymentIntentId: string; kind?: string | null; orderId?: string | null },
): void {
  console.info("[stripe webhook] ignored marketplace payment_intent", {
    eventType,
    reason,
    paymentIntentId: ctx.paymentIntentId,
    kind: ctx.kind ?? null,
    orderId: ctx.orderId ?? null,
  });
}

/**
 * Validates a succeeded/failed PaymentIntent before mutating a marketplace order.
 * Does not log; caller should log on failure with {@link logIgnoredMarketplacePaymentIntentWebhook}.
 */
export async function assertMarketplaceOrderPaymentIntentMatchesOrder(
  pi: Stripe.PaymentIntent,
  orderId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const trimmedOrderId = orderId.trim();
  if (!trimmedOrderId) {
    return { ok: false, reason: "missing_order_id" };
  }

  const kind = pi.metadata?.kind ?? null;
  if (!kind?.trim()) {
    return { ok: false, reason: "missing_metadata_kind" };
  }
  if (!isMarketplaceOrderPaymentIntentKind(kind)) {
    return { ok: false, reason: "unexpected_metadata_kind" };
  }

  if (pi.currency?.toLowerCase() !== "usd") {
    return { ok: false, reason: "currency_mismatch" };
  }

  const order = await prisma.order.findUnique({
    where: { id: trimmedOrderId },
    select: {
      id: true,
      buyerId: true,
      totalUsd: true,
      paymentMethod: true,
      paymentStatus: true,
    },
  });
  if (!order) {
    return { ok: false, reason: "order_not_found" };
  }
  if (order.paymentMethod === OrderPaymentMethod.escrow) {
    return { ok: false, reason: "escrow_order_skip_stripe_pi" };
  }

  const expectedCents = Math.round(order.totalUsd * 100);
  if (!Number.isFinite(pi.amount) || Math.abs(pi.amount - expectedCents) > 1) {
    return { ok: false, reason: "amount_mismatch" };
  }

  const customerOnPi = typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
  if (customerOnPi) {
    const buyer = await prisma.user.findUnique({
      where: { id: order.buyerId },
      select: { stripeCustomerId: true },
    });
    const expectedCustomer = buyer?.stripeCustomerId?.trim() ?? "";
    if (expectedCustomer && expectedCustomer !== customerOnPi) {
      return { ok: false, reason: "customer_mismatch" };
    }
  }

  return { ok: true };
}
