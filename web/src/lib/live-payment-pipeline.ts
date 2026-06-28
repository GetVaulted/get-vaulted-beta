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
} from "@/lib/live-buy-now-purchase";
import { resolveCheckoutApplicationFeeCents } from "@/lib/live-show-gmv";
import {
  ensureBreakSpotFulfillmentOrder,
  ensureVariantPurchaseFulfillmentOrder,
} from "@/services/shipping/live-commerce-fulfillment-order";
import { prisma } from "@/lib/prisma";
import { assertPaymentMethodOwnedByUser, getBuyerDefaultCardPaymentMethodId } from "@/lib/stripe-customer";
import { isStripePaymentMethodId } from "@/lib/stripe-payment-method-id";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import {
  buildStripeChargeErrorDebug,
  chargeLiveBuyNowOrderWithSavedCard,
} from "@/lib/stripe-charge-order-saved-pm";
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
  | { outcome: "paid"; paymentIntentId: string }
  | { outcome: "requires_action"; clientSecret: string; paymentIntentId: string }
  | { outcome: "processing"; paymentIntentId: string }
  | { outcome: "error"; code: string; message?: string };

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
  if (lower.includes("no_shipping") || lower.includes("shipping address")) {
    return "Add a shipping address to your Wallet before buying.";
  }
  if (lower.includes("live_shipping_session_not")) {
    return "Could not link this purchase to live shipping — try again.";
  }
  return "Could not prepare checkout. Check your Wallet shipping address and try again.";
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
  if (e instanceof Stripe.errors.StripeCardError) {
    return { outcome: "error", code: "CARD_DECLINED", message: e.message || "Card declined." };
  }
  if (e instanceof Stripe.errors.StripeInvalidRequestError) {
    const lower = (e.message ?? "").toLowerCase();
    if (lower.includes("destination") || lower.includes("application_fee_amount")) {
      return { outcome: "error", code: "SELLER_NOT_READY", message: "Seller payouts are not ready." };
    }
  }
  return { outcome: "error", code: "STRIPE_ERROR", message: "Could not process payment." };
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
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });
  if (!seller?.stripeAccountId || !seller.stripeOnboardingComplete) {
    return { outcome: "error", code: "SELLER_NOT_READY", message: "Seller payouts are not ready." };
  }

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
  } catch (err) {
    console.error("[variant purchase] fulfillment order failed", {
      purchaseId: purchase.id,
      liveRoomId: purchase.liveRoomId,
      err,
    });
    return {
      outcome: "error",
      code: "FULFILLMENT_ORDER_FAILED",
      message: mapLiveFulfillmentOrderError(err),
    };
  }
  const amountCents = Math.round(Math.max(0, fulfillment.chargeTotalUsd) * 100);
  if (amountCents < 50) {
    return { outcome: "error", code: "INVALID_AMOUNT", message: "Purchase amount is too small to charge." };
  }

  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: purchase.totalUsd,
    isCompanyListing: false,
    liveRoomId: purchase.liveRoomId,
  });

  const stripe = getStripe();

  if (purchase.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(purchase.stripePaymentIntentId);
    const mapped = mapPaymentIntentOutcome(existing);
    if (mapped) return mapped;
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
        },
        description: `Live spot: ${purchase.variant.label}`,
        application_fee_amount: feeCents,
        transfer_data: { destination: seller.stripeAccountId },
      },
      { idempotencyKey: `variant_saved_pm_${purchase.id}_${amountCents}_${pmId}` },
    );

    await prisma.liveItemVariantPurchase.update({
      where: { id: purchase.id },
      data: { stripePaymentIntentId: intent.id },
    });

    const mapped = mapPaymentIntentOutcome(intent);
    if (mapped) return mapped;

    return { outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED", message: "Payment did not complete." };
  } catch (e) {
    return mapLiveSavedCardStripeError(e, {
      kind: "variant_purchase",
      referenceId: purchase.id,
      amountCents,
      customerId,
      paymentMethodId: pmId,
      destinationAccount: seller.stripeAccountId,
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
    await releaseVariantPurchaseOnCheckoutExpired(purchase.id);
    return {
      outcome: "error",
      code: mapped?.code ?? "PAYMENT_INTENT_NOT_COMPLETED",
      message: mapped?.message ?? "Payment did not complete.",
    };
  }

  if (mapped.outcome === "paid") {
    await finalizeLiveItemVariantPurchasePaid(purchase.id, mapped.paymentIntentId);
    emitLiveRoomQueueItemsChanged(purchase.liveRoomId);
  }
  return mapped;
}

export async function settleLiveItemVariantPurchase(args: {
  buyerId: string;
  purchaseId: string;
  paymentMethodId?: string | null;
}): Promise<
  | { ok: true; paid: true; purchaseId: string }
  | { ok: true; requiresAction: true; purchaseId: string; clientSecret: string; paymentIntentId: string }
  | { ok: true; processing: true; purchaseId: string; paymentIntentId: string }
  | { ok: false; purchaseId: string; code: string; message: string; paymentFailed: true; paymentFailureId?: string }
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
    await finalizeLiveItemVariantPurchasePaid(args.purchaseId, charge.paymentIntentId);
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
    await releaseVariantPurchaseOnCheckoutExpired(args.purchaseId);
    return {
      ok: false,
      purchaseId: args.purchaseId,
      code: charge.code,
      message: failure.failureReason ?? "Payment failed.",
      paymentFailed: true,
      paymentFailureId: failure.id,
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

  await releaseVariantPurchaseOnCheckoutExpired(args.purchaseId);
  return {
    ok: false,
    purchaseId: args.purchaseId,
    code: charge.outcome === "error" ? charge.code : "PAYMENT_FAILED",
    message: charge.outcome === "error" ? charge.message ?? "Payment failed." : "Payment failed.",
    paymentFailed: true,
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
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });
  if (!seller?.stripeAccountId || !seller.stripeOnboardingComplete) {
    return { outcome: "error", code: "SELLER_NOT_READY", message: "Seller payouts are not ready." };
  }

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
    console.error("[break spot] fulfillment order failed", {
      breakSpotId: spot.id,
      liveRoomId: spot.liveRoomId,
      err,
    });
    return {
      outcome: "error",
      code: "FULFILLMENT_ORDER_FAILED",
      message: mapLiveFulfillmentOrderError(err),
    };
  }
  const amountCents = Math.round(Math.max(0, fulfillment.chargeTotalUsd) * 100);
  if (amountCents < 50) {
    return { outcome: "error", code: "INVALID_AMOUNT", message: "Spot price is too small to charge." };
  }

  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: spot.priceUsd,
    isCompanyListing: false,
    liveRoomId: spot.liveRoomId,
  });

  const stripe = getStripe();
  if (spot.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(spot.stripePaymentIntentId);
    const mapped = mapPaymentIntentOutcome(existing);
    if (mapped?.outcome === "paid") {
      await finalizeBreakSpotPaid({ breakSpotId: spot.id, paymentIntentId: mapped.paymentIntentId });
    }
    if (mapped) return mapped;
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
        },
        description: `Break spot: ${spot.spotLabel}`,
        application_fee_amount: feeCents,
        transfer_data: { destination: seller.stripeAccountId },
      },
      { idempotencyKey: `break_spot_saved_pm_${spot.id}_${amountCents}_${pmId}` },
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
      destinationAccount: seller.stripeAccountId,
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

  return {
    ok: false,
    code: charge.code,
    message: failure.failureReason ?? "Payment failed. Update your card and try again.",
    paymentFailed: true,
    paymentFailureId: failure.id,
  };
}
