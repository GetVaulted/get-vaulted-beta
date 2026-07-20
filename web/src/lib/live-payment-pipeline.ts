/**
 * Unified live-show buyer payment pipeline.
 *
 * All live commerce (bid gate, auction win charge, variant spot purchase, buy-now, break spots)
 * should flow through wallet readiness + saved-card settlement here.
 *
 * Preauthorization (card hold at room entry) is scaffolded — wallet readiness gates access today;
 * `preauthorizationStatus: "wallet_ready"` means saved card + shipping on file, not a Stripe hold.
 */

import Stripe from "stripe";
import { getBuyerLiveWalletReadiness } from "@/lib/buyer-live-wallet-readiness";
import {
  finalizeLiveItemVariantPurchasePaid,
  releaseVariantPurchaseOnCheckoutExpired,
} from "@/lib/live-item-variant-purchase";
import {
  recordLiveRoomPaymentFailure,
  recordPaymentFailureFromCharge,
} from "@/lib/live-room-payment-failure";
import {
  createLiveBuyNowOrder,
  finalizeBreakSpotPaid,
  refreshBuyerShippingOnOrderIfIncomplete,
  releaseBreakSpotOnDefiniteFailure,
} from "@/lib/live-buy-now-purchase";
import { resolveCheckoutApplicationFeeCents } from "@/lib/live-show-gmv";
import {
  ensureBreakSpotFulfillmentOrder,
  ensureVariantPurchaseFulfillmentOrder,
} from "@/services/shipping/live-commerce-fulfillment-order";
import { syncOrderShippingFromLiveSessionTx } from "@/services/shipping/live-commerce-shipping-settlement";
import { prisma } from "@/lib/prisma";
import {
  liveSavedCardSellerReady,
  sellerStripeCollectSelect,
} from "@/lib/seller-stripe-collect-ready";
import { assertPaymentMethodOwnedByUser, getBuyerDefaultCardPaymentMethodId } from "@/lib/stripe-customer";
import { isStripePaymentMethodId } from "@/lib/stripe-payment-method-id";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import {
  buildStripeChargeErrorDebug,
  chargeLiveBuyNowOrderWithSavedCard,
  isDefiniteStripeCardDecline,
} from "@/lib/stripe-charge-order-saved-pm";
import {
  connectPaymentIntentTransferData,
  resolveConnectPaymentTaxPlan,
} from "@/lib/sales-tax-charge";
import { estimateStripeProcessingFeeCents } from "@/lib/seller-payout-estimate";
import { orderTaxUpdateData } from "@/lib/sales-tax-order";
import { stripeOffSessionPaymentIntentOptions } from "@/lib/stripe-payment-method-config";

export const LIVE_VARIANT_PURCHASE_PI_KIND = "variant_purchase_saved_pm" as const;
export const LIVE_BREAK_SPOT_PI_KIND = "break_spot_saved_pm" as const;

export type LivePreauthorizationStatus = "none" | "wallet_ready" | "authorized";

export type LiveBuyerPaymentFailureState = {
  code: string;
  message: string;
};

export type LiveBuyerPaymentSessionState = {
  /** Saved card + shipping on file — required before any paid live action. */
  liveRoomPaymentReady: boolean;
  paymentReady: boolean;
  shippingReady: boolean;
  activePaymentMethodId: string | null;
  /** `wallet_ready` = card on file (MVP). `authorized` reserved for future Stripe holds. */
  preauthorizationStatus: LivePreauthorizationStatus;
  paymentFailureState: LiveBuyerPaymentFailureState | null;
};

export type LiveSavedCardChargeOutcome =
  | { outcome: "paid"; paymentIntentId: string; chargeUsd?: number }
  | { outcome: "requires_action"; clientSecret: string; paymentIntentId: string }
  | { outcome: "processing"; paymentIntentId: string }
  | {
      outcome: "error";
      code: string;
      message?: string;
      fulfillmentDetail?: string;
      /**
       * Whether this failure is a CONFIRMED-dead PaymentIntent / rejected-before-charge error
       * (safe to release held inventory/claims on) vs. an ambiguous error where Stripe may have
       * actually processed the charge (must NOT release — see FIX 6). Defaults to "definite" when
       * omitted, since most error branches here are constructed before any Stripe charge attempt
       * (validation/config failures) or from Stripe explicitly rejecting the request; only the
       * generic catch-all branches in `mapLiveSavedCardStripeError` mark this `false`.
       */
      definiteFailure?: boolean;
    };

export async function getLiveBuyerPaymentSessionState(args: {
  buyerId: string;
  liveRoomId?: string;
  preferredPaymentMethodId?: string | null;
}): Promise<LiveBuyerPaymentSessionState> {
  const wallet = await getBuyerLiveWalletReadiness(args.buyerId);
  let activePaymentMethodId: string | null = null;

  const preferred = args.preferredPaymentMethodId?.trim() ?? "";
  if (isStripePaymentMethodId(preferred)) {
    try {
      await assertPaymentMethodOwnedByUser(args.buyerId, preferred);
      activePaymentMethodId = preferred;
    } catch {
      activePaymentMethodId = null;
    }
  }
  if (!activePaymentMethodId && wallet.paymentReady) {
    activePaymentMethodId = await getBuyerDefaultCardPaymentMethodId(args.buyerId);
  }

  const liveRoomPaymentReady = wallet.paymentReady && wallet.shippingReady;
  let preauthorizationStatus: LivePreauthorizationStatus = "none";
  if (liveRoomPaymentReady && activePaymentMethodId) {
    preauthorizationStatus = "wallet_ready";
  } else if (wallet.paymentReady || wallet.shippingReady) {
    preauthorizationStatus = "none";
  }

  void args.liveRoomId;

  return {
    liveRoomPaymentReady,
    paymentReady: wallet.paymentReady,
    shippingReady: wallet.shippingReady,
    activePaymentMethodId,
    preauthorizationStatus,
    paymentFailureState: null,
  };
}

async function resolveBuyerPaymentMethodId(
  buyerId: string,
  paymentMethodId?: string | null,
): Promise<string | null> {
  const explicit = paymentMethodId?.trim() ?? "";
  if (isStripePaymentMethodId(explicit)) {
    await assertPaymentMethodOwnedByUser(buyerId, explicit);
    return explicit;
  }
  return getBuyerDefaultCardPaymentMethodId(buyerId);
}

function mapPaymentIntentOutcome(
  pi: Stripe.PaymentIntent,
): LiveSavedCardChargeOutcome | null {
  if (pi.status === "succeeded") {
    return { outcome: "paid", paymentIntentId: pi.id };
  }
  if (pi.status === "requires_action" || pi.status === "requires_confirmation") {
    const clientSecret = pi.client_secret;
    if (!clientSecret) return { outcome: "error", code: "MISSING_CLIENT_SECRET" };
    return { outcome: "requires_action", clientSecret, paymentIntentId: pi.id };
  }
  if (pi.status === "processing") {
    return { outcome: "processing", paymentIntentId: pi.id };
  }
  if (pi.status === "requires_payment_method") {
    return {
      outcome: "error",
      code: "CARD_DECLINED",
      message: "Your saved card could not be charged.",
    };
  }
  return null;
}

/** Buyer-safe copy when live shipping / fulfillment order prep fails before Stripe. */
export function mapLiveFulfillmentOrderError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const lower = msg.toLowerCase();
  if (
    lower.includes("shippingtermssnapshotjson") ||
    lower.includes("shippingmode") ||
    lower.includes("does not exist") ||
    lower.includes("column") && lower.includes("order")
  ) {
    return "Checkout is not ready on this show yet — the host may need to update shipping settings.";
  }
  if (lower.includes("live_shipping_not_applicable")) {
    return "Shipping is not set up for this show yet.";
  }
  if (
    lower.includes("sellershippingprofile") ||
    lower.includes("seller_shipping_profile") ||
    (lower.includes("relation") && lower.includes("does not exist"))
  ) {
    return "Checkout is not ready on this show yet — shipping profiles may still be setting up.";
  }
  if (lower.includes("no_shipping_address") || msg === "NO_SHIPPING_ADDRESS") {
    return "Add a delivery address to your Wallet (where items ship after the show). Your card billing ZIP is separate.";
  }
  if (lower.includes("no_shipping") || lower.includes("shipping address")) {
    return "Add a delivery address to your Wallet before buying live spots.";
  }
  if (lower.includes("live_shipping_seller_mismatch")) {
    return "Checkout could not link this purchase to the show — try again or contact support.";
  }
  if (lower.includes("live_shipping_session_not")) {
    return "Could not link this purchase to live shipping — try again.";
  }
  if (lower.includes("expired transaction") || lower.includes("interactive transaction timeout")) {
    return "Checkout timed out — try again in a moment.";
  }
  return "Checkout could not be prepared before your card was charged. This is usually a show setup issue — ask the host to check shipping settings, or try again in a moment.";
}

/** Stripe Connect requires application_fee_amount strictly less than the charge amount. */
function capLiveApplicationFeeCents(feeCents: number, amountCents: number): number {
  if (amountCents < 50) return 0;
  return Math.min(Math.max(0, feeCents), Math.max(0, amountCents - 50));
}

async function applyOrderTaxPlanForLiveCharge(args: {
  orderId: string;
  sellerId: string;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  applicationFeeCents: number;
}) {
  await refreshBuyerShippingOnOrderIfIncomplete(args.orderId);
  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: {
      shipRecipientName: true,
      shipAddress: true,
      shipCity: true,
      shipState: true,
      shipZip: true,
      shipCountry: true,
    },
  });
  if (!order) {
    return {
      amountCents: Math.round((args.itemPriceUsd + args.shippingPriceUsd) * 100),
      feeCents: args.applicationFeeCents,
      sellerTransferCents: null as number | null,
      metadata: {} as Record<string, string>,
    };
  }
  const taxPlan = await resolveConnectPaymentTaxPlan({
    shipTo: order,
    itemPriceUsd: args.itemPriceUsd,
    shippingPriceUsd: args.shippingPriceUsd,
    applicationFeeCents: args.applicationFeeCents,
    sellerId: args.sellerId,
  });
  await prisma.order.update({ where: { id: args.orderId }, data: orderTaxUpdateData(taxPlan.orderTax) });
  return {
    amountCents: taxPlan.amountCents,
    feeCents: taxPlan.applicationFeeCents,
    sellerTransferCents: taxPlan.sellerTransferCents,
    metadata: taxPlan.metadata,
  };
}

function mapLiveSavedCardStripeError(
  e: unknown,
  ctx: {
    kind: "variant_purchase" | "break_spot";
    referenceId: string;
    amountCents: number;
    customerId: string;
    paymentMethodId: string;
    destinationAccount: string;
  },
): LiveSavedCardChargeOutcome {
  const stripeDebug = buildStripeChargeErrorDebug(e, {
    amountCents: ctx.amountCents,
    currency: "usd",
    customerId: ctx.customerId,
    paymentMethodId: ctx.paymentMethodId,
    destinationAccount: ctx.destinationAccount,
  });
  console.error(`[${ctx.kind}] stripe charge error`, {
    referenceId: ctx.referenceId,
    ...stripeDebug,
  });
  // FIX 6: reuse the same "confirmed dead PaymentIntent" check used for marketplace orders
  // (`isDefiniteStripeCardDecline`) to decide whether it's safe to release held inventory/claims.
  // `StripeInvalidRequestError` branches below mean Stripe rejected the request before any money
  // moved, so those are always definite too. Only the generic/unknown-error fallback further down
  // (network/timeout/rate-limit/unexpected Stripe API error) is genuinely ambiguous about whether a
  // charge went through.
  if (e instanceof Stripe.errors.StripeCardError) {
    return {
      outcome: "error",
      code: "CARD_DECLINED",
      message: e.message || "Card declined.",
      definiteFailure: isDefiniteStripeCardDecline(e),
    };
  }
  if (e instanceof Stripe.errors.StripeInvalidRequestError) {
    const lower = (e.message ?? "").toLowerCase();
    if (lower.includes("destination") || lower.includes("application_fee_amount")) {
      return {
        outcome: "error",
        code: "SELLER_NOT_READY",
        message: "Seller payouts are not ready.",
        definiteFailure: true,
      };
    }
    if (lower.includes("payment_method_type") || lower.includes("payment method type")) {
      return {
        outcome: "error",
        code: "STRIPE_ERROR",
        message: "Payment could not be completed. Try updating your saved card in Wallet.",
        definiteFailure: true,
      };
    }
    if (lower.includes("no such paymentmethod") || lower.includes("does not belong to customer")) {
      return {
        outcome: "error",
        code: "NO_SAVED_CARD",
        message: "Add a saved payment method to your Wallet.",
        definiteFailure: true,
      };
    }
  }
  const stripeMessage = stripeDebug.message?.trim();
  if (
    stripeMessage &&
    stripeMessage.length <= 120 &&
    !/secret|api key|webhook|prisma|sql/i.test(stripeMessage)
  ) {
    // Unknown Stripe error type reaching this point (e.g. StripeAPIError, StripeConnectionError,
    // StripeRateLimitError) — we don't know whether Stripe actually processed the charge.
    return { outcome: "error", code: "STRIPE_ERROR", message: stripeMessage, definiteFailure: false };
  }
  return { outcome: "error", code: "STRIPE_ERROR", message: "Could not process payment.", definiteFailure: false };
}

/** Clear dead intents so recovery retries can create a fresh PaymentIntent (matches buy-now). */
async function handleExistingLiveSavedCardPaymentIntent(
  stripe: Stripe,
  pi: Stripe.PaymentIntent,
  clearPaymentIntentId: () => Promise<void>,
): Promise<{ outcome: LiveSavedCardChargeOutcome | null; clearedDeadIntentId: string | null }> {
  if (pi.status === "canceled" || pi.status === "requires_payment_method") {
    if (pi.status === "requires_payment_method") {
      try {
        await stripe.paymentIntents.cancel(pi.id);
      } catch (e) {
        console.warn("[live saved-card] could not cancel dead payment intent", pi.id, e);
      }
    }
    await clearPaymentIntentId();
    return { outcome: null, clearedDeadIntentId: pi.id };
  }
  return { outcome: mapPaymentIntentOutcome(pi), clearedDeadIntentId: null };
}

/**
 * Stable per-logical-charge Stripe idempotency key — mirrors the established pattern for regular
 * marketplace orders (`pay_order_saved_pm_${orderId}_${amountCents}_${pmId}` in
 * `stripe-charge-order-saved-pm.ts`, `buy_now_${orderId}_...` in `services/payments.ts`): keyed on
 * the purchase/spot id + amount + payment method, NOT wall-clock time. Two near-simultaneous calls
 * for the SAME purchase now collide on the SAME key, so Stripe's idempotency layer — not a
 * different key per millisecond — is what prevents a double PaymentIntent/double charge.
 *
 * `clearedDeadIntentId` is the only legitimate reason to rotate the key: it's set only after we've
 * confirmed (via `handleExistingLiveSavedCardPaymentIntent`) that the PRIOR PaymentIntent is
 * genuinely dead (canceled / requires_payment_method), so a fresh key for a fresh attempt is safe —
 * this is a real state change recorded via the dead intent's own id, not a wall-clock timestamp.
 */
export function liveSavedCardStripeIdempotencyKey(args: {
  prefix: string;
  referenceId: string;
  amountCents: number;
  paymentMethodId: string;
  clearedDeadIntentId?: string | null;
}): string {
  const base = `${args.prefix}_${args.referenceId}_${args.amountCents}_${args.paymentMethodId}`;
  return args.clearedDeadIntentId ? `${base}_after_${args.clearedDeadIntentId}` : base;
}

/**
 * Instant saved-card charge for a reserved live variant / team spot purchase.
 * On failure the caller must release inventory via {@link releaseVariantPurchaseOnCheckoutExpired}.
 */
export async function chargeLiveItemVariantPurchaseWithSavedCard(args: {
  buyerId: string;
  purchaseId: string;
  paymentMethodId?: string | null;
}): Promise<LiveSavedCardChargeOutcome> {
  if (!isStripeConfigured()) {
    return { outcome: "error", code: "STRIPE_NOT_CONFIGURED", message: "Payments are not configured." };
  }

  const purchase = await prisma.liveItemVariantPurchase.findFirst({
    where: { id: args.purchaseId, buyerId: args.buyerId },
    include: {
      variant: { select: { label: true } },
      liveRoom: { select: { id: true, sellerId: true, status: true } },
    },
  });
  if (!purchase) return { outcome: "error", code: "PURCHASE_NOT_FOUND", message: "Purchase not found." };
  if (purchase.paymentStatus === "paid") {
    return { outcome: "paid", paymentIntentId: purchase.stripePaymentIntentId ?? purchase.id };
  }
  if (purchase.paymentStatus !== "pending_payment") {
    return { outcome: "error", code: "PURCHASE_NOT_PAYABLE", message: "This purchase is not payable." };
  }
  if (purchase.totalUsd <= 0) {
    return { outcome: "paid", paymentIntentId: purchase.stripePaymentIntentId ?? purchase.id };
  }
  if (purchase.liveRoom.status !== "live") {
    return { outcome: "error", code: "ROOM_NOT_LIVE", message: "This room is not live." };
  }

  const seller = await prisma.user.findUnique({
    where: { id: purchase.liveRoom.sellerId },
    select: sellerStripeCollectSelect,
  });
  if (!liveSavedCardSellerReady(seller)) {
    return { outcome: "error", code: "SELLER_NOT_READY", message: "Seller payouts are not ready." };
  }
  const destinationAccount = seller!.stripeAccountId!.trim();

  let pmId: string | null;
  try {
    pmId = await resolveBuyerPaymentMethodId(args.buyerId, args.paymentMethodId);
  } catch (e) {
    const code = e instanceof Error ? e.message : "PM_VALIDATION_FAILED";
    return { outcome: "error", code, message: "Could not use that payment method." };
  }
  if (!pmId) {
    return { outcome: "error", code: "NO_SAVED_CARD", message: "Add a saved payment method to your Wallet." };
  }

  const buyer = await prisma.user.findUnique({
    where: { id: args.buyerId },
    select: { stripeCustomerId: true },
  });
  const customerId = buyer?.stripeCustomerId?.trim();
  if (!customerId) {
    return { outcome: "error", code: "BUYER_STRIPE_CUSTOMER_MISSING", message: "Wallet is not linked to Stripe." };
  }

  let fulfillment: { orderId: string; chargeTotalUsd: number };
  try {
    fulfillment = await ensureVariantPurchaseFulfillmentOrder(purchase.id);
    await prisma.$transaction(async (tx) => {
      await syncOrderShippingFromLiveSessionTx(tx, fulfillment.orderId);
    });
  } catch (err) {
    const fulfillmentDetail = err instanceof Error ? err.message : String(err ?? "");
    console.error("[variant purchase] fulfillment order failed", {
      purchaseId: purchase.id,
      liveRoomId: purchase.liveRoomId,
      liveRoomItemId: purchase.liveRoomItemId,
      message: fulfillmentDetail,
      err,
    });
    return {
      outcome: "error",
      code: "FULFILLMENT_ORDER_FAILED",
      message: mapLiveFulfillmentOrderError(err),
      fulfillmentDetail,
    };
  }
  const feeCentsRaw = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: purchase.totalUsd,
    isCompanyListing: false,
    liveRoomId: purchase.liveRoomId,
    sellerId: purchase.liveRoom.sellerId,
    orderId: fulfillment.orderId,
  });

  const orderRow = await prisma.order.findUnique({
    where: { id: fulfillment.orderId },
    select: { itemPriceUsd: true, shippingPriceUsd: true },
  });
  const itemUsd = orderRow?.itemPriceUsd ?? purchase.totalUsd;
  const shipUsd = orderRow?.shippingPriceUsd ?? 0;

  const taxCharge = await applyOrderTaxPlanForLiveCharge({
    orderId: fulfillment.orderId,
    sellerId: purchase.liveRoom.sellerId,
    itemPriceUsd: itemUsd,
    shippingPriceUsd: shipUsd,
    applicationFeeCents: feeCentsRaw,
  });
  const amountCents = taxCharge.amountCents;
  if (amountCents < 50) {
    return { outcome: "error", code: "INVALID_AMOUNT", message: "Purchase amount is too small to charge." };
  }
  const feeCents = capLiveApplicationFeeCents(taxCharge.feeCents, amountCents);

  const stripe = getStripe();

  let clearedDeadIntentId: string | null = null;
  if (purchase.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(purchase.stripePaymentIntentId);
    const handled = await handleExistingLiveSavedCardPaymentIntent(stripe, existing, async () => {
      await prisma.liveItemVariantPurchase.updateMany({
        where: { id: purchase.id },
        data: { stripePaymentIntentId: null },
      });
    });
    clearedDeadIntentId = handled.clearedDeadIntentId;
    if (handled.outcome) return handled.outcome;
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: pmId,
        confirm: true,
        off_session: true,
        ...stripeOffSessionPaymentIntentOptions("live"),
        metadata: {
          kind: LIVE_VARIANT_PURCHASE_PI_KIND,
          purchaseId: purchase.id,
          variantId: purchase.variantId,
          liveRoomId: purchase.liveRoomId,
          userId: args.buyerId,
          orderId: fulfillment.orderId,
          ...taxCharge.metadata,
        },
        description: `Live spot: ${purchase.variant.label}`,
        ...connectPaymentIntentTransferData({
          destinationAccountId: destinationAccount,
          applicationFeeCents: feeCents,
          sellerTransferCents: taxCharge.sellerTransferCents,
          processingFeeCents: feeCents > 0 ? estimateStripeProcessingFeeCents(amountCents) : 0,
        }),
      },
      {
        idempotencyKey: liveSavedCardStripeIdempotencyKey({
          prefix: "variant_saved_pm",
          referenceId: purchase.id,
          amountCents,
          paymentMethodId: pmId,
          clearedDeadIntentId,
        }),
      },
    );

    await prisma.liveItemVariantPurchase.update({
      where: { id: purchase.id },
      data: { stripePaymentIntentId: intent.id },
    });

    const mapped = mapPaymentIntentOutcome(intent);
    if (mapped?.outcome === "paid") {
      return { ...mapped, chargeUsd: amountCents / 100 };
    }
    if (mapped) return mapped;

    return { outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED", message: "Payment did not complete." };
  } catch (e) {
    return mapLiveSavedCardStripeError(e, {
      kind: "variant_purchase",
      referenceId: purchase.id,
      amountCents,
      customerId,
      paymentMethodId: pmId,
      destinationAccount: destinationAccount,
    });
  }
}

/** Poll Stripe after client SCA and finalize the variant purchase when succeeded. */
export async function syncLiveItemVariantPurchasePaymentIntent(args: {
  buyerId: string;
  purchaseId: string;
}): Promise<LiveSavedCardChargeOutcome> {
  if (!isStripeConfigured()) {
    return { outcome: "error", code: "STRIPE_NOT_CONFIGURED" };
  }

  const purchase = await prisma.liveItemVariantPurchase.findFirst({
    where: { id: args.purchaseId, buyerId: args.buyerId },
    select: { id: true, paymentStatus: true, stripePaymentIntentId: true, liveRoomId: true },
  });
  if (!purchase) return { outcome: "error", code: "PURCHASE_NOT_FOUND" };
  if (purchase.paymentStatus === "paid") {
    return { outcome: "paid", paymentIntentId: purchase.stripePaymentIntentId ?? purchase.id };
  }
  if (!purchase.stripePaymentIntentId) {
    return { outcome: "error", code: "NO_PAYMENT_INTENT" };
  }

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(purchase.stripePaymentIntentId);
  const mapped = mapPaymentIntentOutcome(pi);
  if (!mapped || mapped.outcome === "error") {
    // FIX 1: mirror the break-spot gating — only release the held purchase on a CONFIRMED-definite
    // failure. `mapped` here reflects a freshly-retrieved PaymentIntent status (never ambiguous), but
    // we still check `definiteFailure !== false` for consistency with the other release call sites.
    if (!mapped || mapped.definiteFailure !== false) {
      await releaseVariantPurchaseOnCheckoutExpired(purchase.id);
    }
    return {
      outcome: "error",
      code: mapped?.code ?? "PAYMENT_INTENT_NOT_COMPLETED",
      message: mapped?.message ?? "Payment did not complete.",
    };
  }

  if (mapped.outcome === "paid") {
    const chargeUsd = typeof pi.amount === "number" && pi.amount >= 50 ? pi.amount / 100 : undefined;
    await finalizeLiveItemVariantPurchasePaid(purchase.id, mapped.paymentIntentId, chargeUsd);
    emitLiveRoomQueueItemsChanged(purchase.liveRoomId);
  }
  return mapped;
}

/**
 * Heal PYT/variant purchases stuck in `pending_payment` after Stripe already succeeded
 * (missed webhook / client never synced). Safe to call from buyer order lists.
 */
export async function reconcileBuyerPendingVariantPurchases(buyerId: string, limit = 10): Promise<number> {
  if (!isStripeConfigured()) return 0;
  const pending = await prisma.liveItemVariantPurchase.findMany({
    where: {
      buyerId,
      paymentStatus: "pending_payment",
      stripePaymentIntentId: { not: null },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  let healed = 0;
  for (const row of pending) {
    try {
      const result = await syncLiveItemVariantPurchasePaymentIntent({
        buyerId,
        purchaseId: row.id,
      });
      if (result.outcome === "paid") healed += 1;
    } catch (e) {
      console.warn("[live] reconcileBuyerPendingVariantPurchases", row.id, e);
    }
  }
  return healed;
}

/**
 * Same heal path scoped to a live room (seller sales / host console).
 */
export async function reconcileLiveRoomPendingVariantPurchases(
  liveRoomId: string,
  limit = 25,
): Promise<number> {
  if (!isStripeConfigured()) return 0;
  const pending = await prisma.liveItemVariantPurchase.findMany({
    where: {
      liveRoomId,
      paymentStatus: "pending_payment",
      stripePaymentIntentId: { not: null },
    },
    select: { id: true, buyerId: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  let healed = 0;
  for (const row of pending) {
    try {
      const result = await syncLiveItemVariantPurchasePaymentIntent({
        buyerId: row.buyerId,
        purchaseId: row.id,
      });
      if (result.outcome === "paid") healed += 1;
    } catch (e) {
      console.warn("[live] reconcileLiveRoomPendingVariantPurchases", row.id, e);
    }
  }
  return healed;
}

export async function settleLiveItemVariantPurchase(args: {
  buyerId: string;
  purchaseId: string;
  paymentMethodId?: string | null;
}): Promise<
  | { ok: true; paid: true; purchaseId: string }
  | { ok: true; requiresAction: true; purchaseId: string; clientSecret: string; paymentIntentId: string }
  | { ok: true; processing: true; purchaseId: string; paymentIntentId: string }
  | { ok: false; purchaseId: string; code: string; message: string; paymentFailed: true; paymentFailureId?: string; fulfillmentDetail?: string }
> {
  const purchaseMeta = await prisma.liveItemVariantPurchase.findUnique({
    where: { id: args.purchaseId },
    select: {
      liveRoomId: true,
      liveRoomItemId: true,
      totalUsd: true,
      variant: { select: { label: true } },
    },
  });

  const charge = await chargeLiveItemVariantPurchaseWithSavedCard(args);

  if (charge.outcome === "paid") {
    await finalizeLiveItemVariantPurchasePaid(args.purchaseId, charge.paymentIntentId, charge.chargeUsd);
    if (purchaseMeta) emitLiveRoomQueueItemsChanged(purchaseMeta.liveRoomId);
    return { ok: true, paid: true, purchaseId: args.purchaseId };
  }

  if (purchaseMeta) {
    const failureReason =
      charge.outcome === "error"
        ? charge.message ?? "Payment failed."
        : charge.outcome === "requires_action"
          ? "Your bank requires additional verification."
          : "Payment is still processing.";
    const status =
      charge.outcome === "error" ? ("payment_failed" as const) : ("recovery_pending" as const);
    const failure = await recordLiveRoomPaymentFailure({
      liveRoomId: purchaseMeta.liveRoomId,
      buyerId: args.buyerId,
      kind: "variant_purchase",
      liveRoomItemId: purchaseMeta.liveRoomItemId,
      variantPurchaseId: args.purchaseId,
      amountUsd: purchaseMeta.totalUsd,
      status,
      failureReason,
      itemTitle: purchaseMeta.variant.label,
    });
    if (charge.outcome === "requires_action") {
      return {
        ok: true,
        requiresAction: true,
        purchaseId: args.purchaseId,
        clientSecret: charge.clientSecret,
        paymentIntentId: charge.paymentIntentId,
      };
    }
    if (charge.outcome === "processing") {
      return {
        ok: true,
        processing: true,
        purchaseId: args.purchaseId,
        paymentIntentId: charge.paymentIntentId,
      };
    }
    // FIX 1: mirror the break-spot gating (`settleLiveBreakSpotPayment`) — only release the held
    // purchase on a CONFIRMED-definite failure, not on ambiguous/network/timeout errors where Stripe
    // may have actually processed the charge.
    if (charge.outcome === "error" && charge.definiteFailure !== false) {
      await releaseVariantPurchaseOnCheckoutExpired(args.purchaseId);
    }
    return {
      ok: false,
      purchaseId: args.purchaseId,
      code: charge.code,
      message: failure.failureReason ?? "Payment failed.",
      paymentFailed: true,
      paymentFailureId: failure.id,
      fulfillmentDetail: charge.outcome === "error" ? charge.fulfillmentDetail : undefined,
    };
  }

  if (charge.outcome === "requires_action") {
    return {
      ok: true,
      requiresAction: true,
      purchaseId: args.purchaseId,
      clientSecret: charge.clientSecret,
      paymentIntentId: charge.paymentIntentId,
    };
  }

  if (charge.outcome === "processing") {
    return {
      ok: true,
      processing: true,
      purchaseId: args.purchaseId,
      paymentIntentId: charge.paymentIntentId,
    };
  }

  // FIX 1: same definite-failure gating as above — this is the `!purchaseMeta` fallback branch.
  // All other outcomes are handled above, so `charge` is guaranteed to be an "error" here.
  if (charge.outcome === "error" && charge.definiteFailure !== false) {
    await releaseVariantPurchaseOnCheckoutExpired(args.purchaseId);
  }
  return {
    ok: false,
    purchaseId: args.purchaseId,
    code: charge.outcome === "error" ? charge.code : "PAYMENT_FAILED",
    message: charge.outcome === "error" ? charge.message ?? "Payment failed." : "Payment failed.",
    paymentFailed: true,
    fulfillmentDetail: charge.outcome === "error" ? charge.fulfillmentDetail : undefined,
  };
}

export async function chargeBreakSpotWithSavedCard(args: {
  buyerId: string;
  breakSpotId: string;
  paymentMethodId?: string | null;
}): Promise<LiveSavedCardChargeOutcome> {
  if (!isStripeConfigured()) {
    return { outcome: "error", code: "STRIPE_NOT_CONFIGURED", message: "Payments are not configured." };
  }

  const spot = await prisma.breakSpot.findFirst({
    where: { id: args.breakSpotId, userId: args.buyerId },
    include: {
      liveRoom: { select: { id: true, sellerId: true, status: true } },
    },
  });
  if (!spot) return { outcome: "error", code: "SPOT_NOT_FOUND", message: "Spot not found." };
  if (spot.claimStatus === "paid" || spot.breakPaymentStatus === "paid") {
    return { outcome: "paid", paymentIntentId: spot.stripePaymentIntentId ?? spot.id };
  }
  if (!Number.isFinite(spot.priceUsd) || spot.priceUsd <= 0) {
    return { outcome: "paid", paymentIntentId: spot.id };
  }
  if (spot.liveRoom.status !== "live") {
    return { outcome: "error", code: "ROOM_NOT_LIVE", message: "This room is not live." };
  }

  const seller = await prisma.user.findUnique({
    where: { id: spot.liveRoom.sellerId },
    select: sellerStripeCollectSelect,
  });
  if (!liveSavedCardSellerReady(seller)) {
    return { outcome: "error", code: "SELLER_NOT_READY", message: "Seller payouts are not ready." };
  }
  const breakDestinationAccount = seller!.stripeAccountId!.trim();

  let pmId: string | null;
  try {
    pmId = await resolveBuyerPaymentMethodId(args.buyerId, args.paymentMethodId);
  } catch (e) {
    const code = e instanceof Error ? e.message : "PM_VALIDATION_FAILED";
    return { outcome: "error", code, message: "Could not use that payment method." };
  }
  if (!pmId) {
    return { outcome: "error", code: "NO_SAVED_CARD", message: "Add a saved payment method to your Wallet." };
  }

  const buyer = await prisma.user.findUnique({
    where: { id: args.buyerId },
    select: { stripeCustomerId: true },
  });
  const customerId = buyer?.stripeCustomerId?.trim();
  if (!customerId) {
    return { outcome: "error", code: "BUYER_STRIPE_CUSTOMER_MISSING", message: "Wallet is not linked to Stripe." };
  }

  let fulfillment: { orderId: string; chargeTotalUsd: number };
  try {
    fulfillment = await ensureBreakSpotFulfillmentOrder(spot.id);
  } catch (err) {
    const fulfillmentDetail = err instanceof Error ? err.message : String(err ?? "");
    console.error("[break spot] fulfillment order failed", {
      breakSpotId: spot.id,
      liveRoomId: spot.liveRoomId,
      message: fulfillmentDetail,
      err,
    });
    return {
      outcome: "error",
      code: "FULFILLMENT_ORDER_FAILED",
      message: mapLiveFulfillmentOrderError(err),
      fulfillmentDetail,
    };
  }
  const feeCentsRaw = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: spot.priceUsd,
    isCompanyListing: false,
    liveRoomId: spot.liveRoomId,
    sellerId: spot.liveRoom.sellerId,
    orderId: fulfillment.orderId,
  });

  const orderRow = await prisma.order.findUnique({
    where: { id: fulfillment.orderId },
    select: { itemPriceUsd: true, shippingPriceUsd: true },
  });

  const taxCharge = await applyOrderTaxPlanForLiveCharge({
    orderId: fulfillment.orderId,
    sellerId: spot.liveRoom.sellerId,
    itemPriceUsd: orderRow?.itemPriceUsd ?? spot.priceUsd,
    shippingPriceUsd: orderRow?.shippingPriceUsd ?? 0,
    applicationFeeCents: feeCentsRaw,
  });
  const amountCents = taxCharge.amountCents;
  if (amountCents < 50) {
    return { outcome: "error", code: "INVALID_AMOUNT", message: "Spot price is too small to charge." };
  }
  const feeCents = capLiveApplicationFeeCents(taxCharge.feeCents, amountCents);

  const stripe = getStripe();
  let clearedDeadIntentId: string | null = null;
  if (spot.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(spot.stripePaymentIntentId);
    const handled = await handleExistingLiveSavedCardPaymentIntent(stripe, existing, async () => {
      await prisma.breakSpot.updateMany({
        where: { id: spot.id },
        data: { stripePaymentIntentId: null },
      });
    });
    clearedDeadIntentId = handled.clearedDeadIntentId;
    if (handled.outcome?.outcome === "paid") {
      await finalizeBreakSpotPaid({ breakSpotId: spot.id, paymentIntentId: handled.outcome.paymentIntentId });
    }
    if (handled.outcome) return handled.outcome;
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: pmId,
        confirm: true,
        off_session: true,
        ...stripeOffSessionPaymentIntentOptions("live"),
        metadata: {
          kind: LIVE_BREAK_SPOT_PI_KIND,
          breakSpotId: spot.id,
          liveRoomId: spot.liveRoomId,
          userId: args.buyerId,
          orderId: fulfillment.orderId,
          ...taxCharge.metadata,
        },
        description: `Break spot: ${spot.spotLabel}`,
        ...connectPaymentIntentTransferData({
          destinationAccountId: breakDestinationAccount,
          applicationFeeCents: feeCents,
          sellerTransferCents: taxCharge.sellerTransferCents,
          processingFeeCents: feeCents > 0 ? estimateStripeProcessingFeeCents(amountCents) : 0,
        }),
      },
      {
        idempotencyKey: liveSavedCardStripeIdempotencyKey({
          prefix: "break_spot_saved_pm",
          referenceId: spot.id,
          amountCents,
          paymentMethodId: pmId,
          clearedDeadIntentId,
        }),
      },
    );

    await prisma.breakSpot.update({
      where: { id: spot.id },
      data: { stripePaymentIntentId: intent.id, breakPaymentStatus: "pending_payment" },
    });

    const mapped = mapPaymentIntentOutcome(intent);
    if (mapped?.outcome === "paid") {
      await finalizeBreakSpotPaid({ breakSpotId: spot.id, paymentIntentId: mapped.paymentIntentId });
    }
    if (mapped) return mapped;
    return { outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED", message: "Payment did not complete." };
  } catch (e) {
    return mapLiveSavedCardStripeError(e, {
      kind: "break_spot",
      referenceId: spot.id,
      amountCents,
      customerId,
      paymentMethodId: pmId,
      destinationAccount: breakDestinationAccount,
    });
  }
}

export async function syncBreakSpotPaymentIntent(args: {
  buyerId: string;
  breakSpotId: string;
}): Promise<LiveSavedCardChargeOutcome> {
  if (!isStripeConfigured()) return { outcome: "error", code: "STRIPE_NOT_CONFIGURED" };
  const spot = await prisma.breakSpot.findFirst({
    where: { id: args.breakSpotId, userId: args.buyerId },
    select: { id: true, breakPaymentStatus: true, stripePaymentIntentId: true, claimStatus: true },
  });
  if (!spot) return { outcome: "error", code: "SPOT_NOT_FOUND" };
  if (spot.breakPaymentStatus === "paid" || spot.claimStatus === "paid") {
    return { outcome: "paid", paymentIntentId: spot.stripePaymentIntentId ?? spot.id };
  }
  if (!spot.stripePaymentIntentId) return { outcome: "error", code: "NO_PAYMENT_INTENT" };

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(spot.stripePaymentIntentId);
  const mapped = mapPaymentIntentOutcome(pi);
  if (mapped?.outcome === "paid") {
    await finalizeBreakSpotPaid({ breakSpotId: spot.id, paymentIntentId: mapped.paymentIntentId });
  }
  if (mapped) return mapped;
  return { outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED" };
}

export async function settleLiveBuyNowPurchase(args: {
  buyerId: string;
  liveRoomId: string;
  liveRoomItemId: string;
  paymentMethodId?: string | null;
}): Promise<
  | { ok: true; paid: true; orderId: string }
  | { ok: true; requiresAction: true; orderId: string; clientSecret: string; paymentIntentId: string }
  | { ok: true; processing: true; orderId: string }
  | { ok: false; orderId?: string; code: string; message: string; paymentFailed: true; paymentFailureId?: string }
  | { ok: false; code: string; message: string }
> {
  const created = await createLiveBuyNowOrder({
    buyerId: args.buyerId,
    liveRoomId: args.liveRoomId,
    liveRoomItemId: args.liveRoomItemId,
  });
  if (!created.ok) {
    return { ok: false, code: created.code, message: created.error };
  }

  const charge = await chargeLiveBuyNowOrderWithSavedCard({
    buyerId: args.buyerId,
    orderId: created.orderId,
    liveRoomId: args.liveRoomId,
    liveRoomItemId: args.liveRoomItemId,
    paymentMethodId: args.paymentMethodId,
  });

  if (charge.outcome === "paid") {
    return { ok: true, paid: true, orderId: created.orderId };
  }

  const failure = await recordPaymentFailureFromCharge({
    liveRoomId: args.liveRoomId,
    buyerId: args.buyerId,
    kind: "buy_now",
    liveRoomItemId: args.liveRoomItemId,
    orderId: created.orderId,
    amountUsd: created.amountUsd,
    itemTitle: created.itemTitle,
    charge,
  });

  if (charge.outcome === "requires_action") {
    return {
      ok: true,
      requiresAction: true,
      orderId: created.orderId,
      clientSecret: charge.clientSecret,
      paymentIntentId: charge.paymentIntentId,
    };
  }
  if (charge.outcome === "processing") {
    return { ok: true, processing: true, orderId: created.orderId };
  }

  return {
    ok: false,
    orderId: created.orderId,
    code: charge.code,
    message: failure?.failureReason ?? "Payment failed. Update your card and try again.",
    paymentFailed: true,
    paymentFailureId: failure?.id,
  };
}

export async function settleLiveBreakSpotPayment(args: {
  buyerId: string;
  breakSpotId: string;
  paymentMethodId?: string | null;
}): Promise<
  | { ok: true; paid: true }
  | { ok: true; requiresAction: true; clientSecret: string; paymentIntentId: string }
  | { ok: true; processing: true; paymentIntentId: string }
  | { ok: false; code: string; message: string; paymentFailed: true; paymentFailureId?: string }
  | { ok: false; code: string; message: string }
> {
  const spot = await prisma.breakSpot.findFirst({
    where: { id: args.breakSpotId, userId: args.buyerId },
    select: {
      id: true,
      liveRoomId: true,
      spotLabel: true,
      priceUsd: true,
      liveRoomItemId: true,
    },
  });
  if (!spot) {
    return { ok: false, code: "SPOT_NOT_FOUND", message: "Spot not found." };
  }

  const charge = await chargeBreakSpotWithSavedCard({
    buyerId: args.buyerId,
    breakSpotId: args.breakSpotId,
    paymentMethodId: args.paymentMethodId,
  });

  if (charge.outcome === "paid") {
    return { ok: true, paid: true };
  }

  const failureReason =
    charge.outcome === "error"
      ? charge.message ?? "Payment failed."
      : charge.outcome === "requires_action"
        ? "Your bank requires additional verification."
        : "Payment is still processing.";
  const status = charge.outcome === "error" ? ("payment_failed" as const) : ("recovery_pending" as const);
  const failure = await recordLiveRoomPaymentFailure({
    liveRoomId: spot.liveRoomId,
    buyerId: args.buyerId,
    kind: "break_spot",
    liveRoomItemId: spot.liveRoomItemId,
    breakSpotId: spot.id,
    amountUsd: spot.priceUsd,
    status,
    failureReason,
    itemTitle: spot.spotLabel,
  });

  if (charge.outcome === "requires_action") {
    return {
      ok: true,
      requiresAction: true,
      clientSecret: charge.clientSecret,
      paymentIntentId: charge.paymentIntentId,
    };
  }
  if (charge.outcome === "processing") {
    return { ok: true, processing: true, paymentIntentId: charge.paymentIntentId };
  }

  // FIX 6: unlike variant purchases (`releaseVariantPurchaseOnCheckoutExpired`), a break spot claim
  // was never released on a failed charge, permanently holding the spot after a dead card. Only
  // release on a CONFIRMED-definite failure — an ambiguous/network error must not release a spot
  // whose charge might still have gone through.
  if (charge.outcome === "error" && charge.definiteFailure !== false) {
    await releaseBreakSpotOnDefiniteFailure(spot.id);
  }

  return {
    ok: false,
    code: charge.code,
    message: failure.failureReason ?? "Payment failed. Update your card and try again.",
    paymentFailed: true,
    paymentFailureId: failure.id,
  };
}
