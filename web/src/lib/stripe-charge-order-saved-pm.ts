import Stripe from "stripe";
import { OrderPaymentMethod } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { isEscrowConfigured, orderTotalQualifiesForEscrow } from "@/lib/escrow-config";
import { assertPaymentMethodOwnedByUser, getBuyerDefaultCardPaymentMethodId } from "@/lib/stripe-customer";
import { isStripePaymentMethodId } from "@/lib/stripe-payment-method-id";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { stripeOffSessionPaymentIntentOptions } from "@/lib/stripe-payment-method-config";
import { orderRequiresCheckoutForTax } from "@/lib/stripe-tax";
import { resolveCheckoutApplicationFeeCents, resolveLiveRoomIdForOrder } from "@/lib/live-show-gmv";
import { finalizeLiveBuyNowPurchaseComplete } from "@/lib/live-buy-now-purchase";
import { syncOrderShippingFromLiveSessionTx } from "@/services/shipping/live-commerce-shipping-settlement";
import {
  finalizeStripeMarketplaceOrderPaid,
  processAuctionPaymentExpiries,
  PAYMENT_EXPIRED,
  PAYMENT_FAILED,
  PAYMENT_PAID,
  PAYMENT_PENDING,
  PAYMENT_REFUNDED,
  PAYMENT_REQUIRES_ACTION,
} from "@/services/payments";

/** Short grace window granted when a buyer is actively recovering an expired auction-win order. */
export const RECOVERY_PAYMENT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Beta/dev-only diagnostic snapshot of a Stripe failure during saved-card charge. Never exposed on real
 * production (the retry route gates exposure); always safe to log server-side.
 */
export type StripeChargeErrorDebug = {
  type: string | null;
  code: string | null;
  declineCode: string | null;
  message: string | null;
  paymentIntentId: string | null;
  paymentMethodId: string | null;
  requestId: string | null;
  destinationAccount: string | null;
  amountCents: number | null;
  currency: string | null;
  customerId: string | null;
};

export type ChargeOrderSavedPmOutcome =
  | { outcome: "paid"; paymentIntentId?: string }
  | { outcome: "requires_action"; clientSecret: string; paymentIntentId: string }
  | { outcome: "processing"; paymentIntentId?: string }
  | { outcome: "error"; code: string; stripeDebug?: StripeChargeErrorDebug };

/** Extract beta/dev-safe Stripe error fields for recovery diagnostics. */
function buildStripeChargeErrorDebug(
  e: unknown,
  ctx: {
    amountCents: number;
    currency: string;
    customerId: string;
    paymentMethodId: string;
    destinationAccount: string | null;
  },
): StripeChargeErrorDebug {
  const base: StripeChargeErrorDebug = {
    type: null,
    code: null,
    declineCode: null,
    message: null,
    paymentIntentId: null,
    paymentMethodId: ctx.paymentMethodId,
    requestId: null,
    destinationAccount: ctx.destinationAccount,
    amountCents: ctx.amountCents,
    currency: ctx.currency,
    customerId: ctx.customerId,
  };
  if (e instanceof Stripe.errors.StripeError) {
    return {
      ...base,
      type: e.type ?? null,
      code: e.code ?? null,
      declineCode: e.decline_code ?? null,
      message: e.message ?? null,
      paymentIntentId: e.payment_intent?.id ?? null,
      paymentMethodId: e.payment_method?.id ?? ctx.paymentMethodId,
      requestId: e.requestId ?? null,
    };
  }
  if (e instanceof Error) {
    return { ...base, message: e.message };
  }
  return base;
}

/**
 * Error codes that mean we actually talked to Stripe (PaymentIntent created/confirmed/retrieved),
 * as opposed to a pre-flight guard that rejected before any Stripe call. Used to derive `reachedStripe`
 * in recovery logging.
 */
export const STRIPE_LEVEL_CHARGE_ERROR_CODES: ReadonlySet<string> = new Set([
  "CARD_DECLINED",
  "STRIPE_ERROR",
  "PAYMENT_INTENT_NOT_COMPLETED",
  "MISSING_CLIENT_SECRET",
]);

/** True when the outcome reflects a real Stripe interaction (success, SCA, processing, or a Stripe error). */
export function chargeOutcomeReachedStripe(outcome: string, code: string | null): boolean {
  if (outcome === "paid" || outcome === "requires_action" || outcome === "processing") return true;
  if (outcome === "error" && code) return STRIPE_LEVEL_CHARGE_ERROR_CODES.has(code);
  return false;
}

const PI_KIND = "pay_order_saved_pm" as const;

async function syncLiveBundledShippingOnOrder(orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await syncOrderShippingFromLiveSessionTx(tx, orderId);
  });
}

async function handleRetrievedPaymentIntent(
  orderId: string,
  pi: Stripe.PaymentIntent,
): Promise<ChargeOrderSavedPmOutcome | null> {
  if (pi.status === "succeeded") {
    await finalizeStripeMarketplaceOrderPaid(orderId, pi.id, null);
    return { outcome: "paid", paymentIntentId: pi.id };
  }
  if (pi.status === "requires_action" || pi.status === "requires_confirmation") {
    const cs = pi.client_secret;
    if (!cs) return { outcome: "error", code: "MISSING_CLIENT_SECRET" };
    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: { not: PAYMENT_PAID } },
      data: { paymentStatus: PAYMENT_REQUIRES_ACTION, stripePaymentIntentId: pi.id, status: "pending" },
    });
    return { outcome: "requires_action", clientSecret: cs, paymentIntentId: pi.id };
  }
  if (pi.status === "processing") {
    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: { not: PAYMENT_PAID } },
      data: {
        stripePaymentIntentId: pi.id,
        status: "pending",
        paymentStatus: PAYMENT_PENDING,
      },
    });
    return { outcome: "processing", paymentIntentId: pi.id };
  }
  if (pi.status === "canceled" || pi.status === "requires_payment_method") {
    await prisma.order.updateMany({
      where: { id: orderId },
      data: { stripePaymentIntentId: null },
    });
    return null;
  }
  return null;
}

/**
 * Charges an auction-win order using the winning bid’s saved Stripe PaymentMethod (`Order.paymentLabel` = `pm_…`).
 * On-session only (buyer clicked Pay). Does not run at bid placement time.
 */
export async function chargeMarketplaceOrderWithSavedPaymentMethod(args: {
  buyerId: string;
  orderId: string;
  /** Force this PM (recovery retry). Overrides Order.paymentLabel so a stale card is never reused. */
  paymentMethodId?: string | null;
}): Promise<ChargeOrderSavedPmOutcome> {
  await processAuctionPaymentExpiries();

  if (!isStripeConfigured()) {
    return { outcome: "error", code: "STRIPE_NOT_CONFIGURED" };
  }

  const row = await prisma.order.findFirst({
    where: { id: args.orderId, buyerId: args.buyerId },
    include: {
      listing: { select: { id: true, buyingFormat: true, status: true, isCompanyListing: true } },
      seller: { select: { stripeAccountId: true, stripeOnboardingComplete: true } },
      liveShippingSession: { select: { id: true, shippingCostCents: true, liveShowId: true } },
    },
  });

  if (!row) return { outcome: "error", code: "ORDER_NOT_FOUND" };
  if (row.paymentStatus === PAYMENT_EXPIRED) return { outcome: "error", code: "ORDER_PAYMENT_EXPIRED" };
  if (row.paymentStatus === PAYMENT_PAID) return { outcome: "error", code: "ALREADY_PAID" };
  if (row.paymentMethod === OrderPaymentMethod.escrow) {
    return { outcome: "error", code: "USE_ESCROW_CHECKOUT" };
  }

  const payable =
    row.paymentStatus === PAYMENT_PENDING ||
    row.paymentStatus === PAYMENT_FAILED ||
    row.paymentStatus === PAYMENT_REQUIRES_ACTION;
  if (!payable) return { outcome: "error", code: "ORDER_NOT_PAYABLE" };

  if (row.paymentDeadlineAt && row.paymentDeadlineAt.getTime() < Date.now()) {
    return { outcome: "error", code: "ORDER_PAYMENT_EXPIRED" };
  }

  const subtotalCheck = row.itemPriceUsd + row.shippingPriceUsd + row.taxUsd;
  const useEscrow = orderTotalQualifiesForEscrow(subtotalCheck) && isEscrowConfigured();
  if (orderTotalQualifiesForEscrow(subtotalCheck) && !isEscrowConfigured()) {
    return { outcome: "error", code: "ESCROW_NOT_CONFIGURED" };
  }
  if (useEscrow) {
    return { outcome: "error", code: "USE_ESCROW_CHECKOUT" };
  }

  if (row.listing.buyingFormat !== "auction" || row.listing.status !== "awaiting_auction_payment") {
    return { outcome: "error", code: "ORDER_NOT_ELIGIBLE_SAVED_CARD" };
  }

  if (await orderRequiresCheckoutForTax(row.shipState, row.shipCountry)) {
    return { outcome: "error", code: "REQUIRES_CHECKOUT_FOR_TAX" };
  }

  if (!row.seller.stripeAccountId || !row.seller.stripeOnboardingComplete) {
    return { outcome: "error", code: "SELLER_NOT_READY" };
  }

  const explicitPm = args.paymentMethodId?.trim() ?? "";
  const pmId = isStripePaymentMethodId(explicitPm) ? explicitPm : (row.paymentLabel?.trim() ?? "");
  if (!isStripePaymentMethodId(pmId)) {
    return { outcome: "error", code: "ORDER_SAVED_PM_MISSING" };
  }
  // Persist the PM we are about to charge so the order never points at a stale/expired card.
  if (pmId !== row.paymentLabel?.trim()) {
    await prisma.order.updateMany({
      where: { id: row.id, buyerId: args.buyerId, paymentStatus: { not: PAYMENT_PAID } },
      data: { paymentLabel: pmId },
    });
  }

  try {
    await assertPaymentMethodOwnedByUser(args.buyerId, pmId);
  } catch (e) {
    const c = e instanceof Error ? e.message : "";
    if (c === "STRIPE_NOT_CONFIGURED") return { outcome: "error", code: c };
    if (c === "PM_NOT_OWNED" || c === "PM_NOT_FOUND") return { outcome: "error", code: c };
    return { outcome: "error", code: "PM_VALIDATION_FAILED" };
  }

  await syncLiveBundledShippingOnOrder(row.id);

  const buyer = await prisma.user.findUnique({
    where: { id: args.buyerId },
    select: { stripeCustomerId: true },
  });
  const customerId = buyer?.stripeCustomerId?.trim();
  if (!customerId) {
    return { outcome: "error", code: "BUYER_STRIPE_CUSTOMER_MISSING" };
  }

  const orderFresh = await prisma.order.findUniqueOrThrow({
    where: { id: row.id },
    select: {
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      totalUsd: true,
      stripePaymentIntentId: true,
    },
  });

  const liveRoomId =
    row.liveShippingSession?.liveShowId ?? (await resolveLiveRoomIdForOrder(row.id));
  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: orderFresh.itemPriceUsd,
    isCompanyListing: Boolean(row.listing.isCompanyListing),
    liveRoomId,
  });
  const amountCents = Math.round(Math.max(0, orderFresh.totalUsd) * 100);
  if (amountCents < 50) {
    return { outcome: "error", code: "INVALID_ORDER_AMOUNT" };
  }

  const stripe = getStripe();

  if (orderFresh.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(orderFresh.stripePaymentIntentId);
    const handled = await handleRetrievedPaymentIntent(row.id, existing);
    if (handled) return handled;
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: pmId,
        confirm: true,
        // In-app saved-card recovery charge: instant methods only, no BNPL/ACH redirects.
        ...stripeOffSessionPaymentIntentOptions("marketplace"),
        metadata: {
          orderId: row.id,
          kind: PI_KIND,
          listingId: row.listingId,
        },
        application_fee_amount: feeCents,
        transfer_data: { destination: row.seller.stripeAccountId },
      },
      // PM is part of the key so a recovery retry with a NEW card creates a fresh PaymentIntent
      // instead of replaying the original (expired-card) intent via Stripe idempotency.
      { idempotencyKey: `pay_order_saved_pm_${row.id}_${amountCents}_${pmId}` },
    );

    const postCreate = await handleRetrievedPaymentIntent(row.id, intent);
    if (postCreate) return postCreate;

    await prisma.order.updateMany({
      where: { id: row.id, paymentStatus: { not: PAYMENT_PAID } },
      data: { paymentStatus: PAYMENT_FAILED, status: "cancelled" },
    });
    return { outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED" };
  } catch (e) {
    await prisma.order
      .updateMany({
        where: { id: row.id, paymentStatus: { not: PAYMENT_PAID } },
        data: { paymentStatus: PAYMENT_FAILED, status: "cancelled", stripePaymentIntentId: null },
      })
      .catch(() => {});
    const stripeDebug = buildStripeChargeErrorDebug(e, {
      amountCents,
      currency: "usd",
      customerId,
      paymentMethodId: pmId,
      destinationAccount: row.seller.stripeAccountId ?? null,
    });
    console.error("[payment recovery] stripe charge error", { orderId: row.id, ...stripeDebug });
    if (e instanceof Stripe.errors.StripeCardError) {
      return { outcome: "error", code: "CARD_DECLINED", stripeDebug };
    }
    return { outcome: "error", code: "STRIPE_ERROR", stripeDebug };
  }
}

/**
 * Live auction wins often store `paymentLabel` as `"auction"` until charge time.
 * Resolves the buyer’s default (or first) saved `pm_…`, writes it to the order when needed, then runs
 * {@link chargeMarketplaceOrderWithSavedPaymentMethod} (off-session confirm).
 */
export async function chargeLiveAuctionWinOrderWithBuyerDefaultSavedCard(args: {
  buyerId: string;
  orderId: string;
  /** Recovery retry: charge this freshly-saved PM and overwrite Order.paymentLabel with it. */
  paymentMethodId?: string | null;
}): Promise<ChargeOrderSavedPmOutcome> {
  const row = await prisma.order.findFirst({
    where: { id: args.orderId, buyerId: args.buyerId },
    select: { paymentLabel: true, paymentStatus: true },
  });
  if (!row) return { outcome: "error", code: "ORDER_NOT_FOUND" };
  if (row.paymentStatus === PAYMENT_PAID) return { outcome: "paid" };

  const explicitPm = args.paymentMethodId?.trim() ?? "";
  const current = row.paymentLabel?.trim() ?? "";
  // Prefer the explicit (recovery) PM, then any valid stored PM, then the buyer's default card.
  const pmId = isStripePaymentMethodId(explicitPm)
    ? explicitPm
    : isStripePaymentMethodId(current)
      ? current
      : (await getBuyerDefaultCardPaymentMethodId(args.buyerId)) ?? "";
  if (!isStripePaymentMethodId(pmId)) {
    return { outcome: "error", code: "NO_SAVED_CARD" };
  }
  if (pmId !== current) {
    const updated = await prisma.order.updateMany({
      where: {
        id: args.orderId,
        buyerId: args.buyerId,
        paymentStatus: { not: PAYMENT_PAID },
      },
      data: { paymentLabel: pmId },
    });
    if (updated.count === 0) {
      return { outcome: "error", code: "ORDER_NOT_PAYABLE" };
    }
  }
  return chargeMarketplaceOrderWithSavedPaymentMethod({
    buyerId: args.buyerId,
    orderId: args.orderId,
    paymentMethodId: pmId,
  });
}

export type ReopenExpiredOrderResult = { reopened: boolean; reason?: string };

/**
 * Active-recovery only: re-open an auction-win order whose payment window lapsed so the buyer can pay
 * with a freshly saved card. Intentionally narrow — callers must be the authenticated payment-failure
 * recovery path, never normal checkout.
 *
 * Guardrails:
 *  - only the buyer attached to the order (caller passes the failed order's buyerId)
 *  - auction-win, non-escrow orders only
 *  - never resurrect paid / refunded / fulfilled orders
 *  - item must still be reservable for this winner: listing parked at `auction_ended_unpaid`
 *    (expired, not yet relisted/sold/voided) or still `awaiting_auction_payment` (deadline just lapsed,
 *    not yet swept). Since `Order.listingId` is unique, this order is the only claimant.
 */
export async function reopenExpiredAuctionOrderForRecovery(args: {
  orderId: string;
  buyerId: string;
  recoveryWindowMs?: number;
}): Promise<ReopenExpiredOrderResult> {
  const order = await prisma.order.findFirst({
    where: { id: args.orderId, buyerId: args.buyerId },
    select: {
      id: true,
      listingId: true,
      paymentStatus: true,
      paymentMethod: true,
      fulfillmentStatus: true,
      paymentDeadlineAt: true,
      listing: { select: { buyingFormat: true, status: true, moderationRemovedAt: true } },
    },
  });
  if (!order) return { reopened: false, reason: "ORDER_NOT_FOUND" };
  if (order.listing.buyingFormat !== "auction") return { reopened: false, reason: "NOT_AUCTION" };
  if (order.paymentMethod === OrderPaymentMethod.escrow) return { reopened: false, reason: "ESCROW" };
  if (order.paymentStatus === PAYMENT_PAID) return { reopened: false, reason: "ALREADY_PAID" };
  if (order.paymentStatus === PAYMENT_REFUNDED) return { reopened: false, reason: "REFUNDED" };
  if (order.fulfillmentStatus && order.fulfillmentStatus !== "pending") {
    return { reopened: false, reason: "FULFILLED" };
  }
  if (order.listing.moderationRemovedAt) return { reopened: false, reason: "LISTING_REMOVED" };

  const deadlinePast =
    order.paymentDeadlineAt != null && order.paymentDeadlineAt.getTime() < Date.now();
  const isExpired = order.paymentStatus === PAYMENT_EXPIRED || deadlinePast;
  if (!isExpired) return { reopened: false, reason: "NOT_EXPIRED" };

  // Reservability gate. If our order already expired, the listing must still be parked for the winner.
  // If only the deadline lapsed (not yet swept), the listing is still awaiting our payment.
  const reservable =
    order.paymentStatus === PAYMENT_EXPIRED
      ? order.listing.status === "auction_ended_unpaid"
      : order.listing.status === "awaiting_auction_payment" ||
        order.listing.status === "auction_ended_unpaid";
  if (!reservable) return { reopened: false, reason: "ITEM_NOT_REOPENABLE" };

  const newDeadline = new Date(Date.now() + (args.recoveryWindowMs ?? RECOVERY_PAYMENT_WINDOW_MS));

  const ok = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        buyerId: args.buyerId,
        paymentStatus: {
          in: [PAYMENT_EXPIRED, PAYMENT_PENDING, PAYMENT_FAILED, PAYMENT_REQUIRES_ACTION],
        },
      },
      data: {
        paymentStatus: PAYMENT_PENDING,
        status: "pending",
        paymentDeadlineAt: newDeadline,
        stripePaymentIntentId: null,
        stripeCheckoutSessionId: null,
      },
    });
    if (updated.count === 0) return false;
    // Re-open the listing for payment only from the parked state; never reactivate a sold/relisted one.
    await tx.listing.updateMany({
      where: { id: order.listingId, status: "auction_ended_unpaid", moderationRemovedAt: null },
      data: { status: "awaiting_auction_payment" },
    });
    return true;
  });

  if (!ok) return { reopened: false, reason: "RACE" };

  console.info("[payment recovery] reopened expired order for active recovery", {
    orderId: order.id,
    buyerId: args.buyerId,
    listingId: order.listingId,
    previousPaymentStatus: order.paymentStatus,
    newPaymentDeadlineAt: newDeadline.toISOString(),
  });
  return { reopened: true };
}

export const LIVE_BUY_NOW_PI_KIND = "live_buy_now_saved_pm" as const;

async function handleLiveBuyNowPaymentIntent(
  orderId: string,
  liveRoomId: string,
  liveRoomItemId: string,
  pi: Stripe.PaymentIntent,
): Promise<ChargeOrderSavedPmOutcome | null> {
  if (pi.status === "succeeded") {
    await finalizeLiveBuyNowPurchaseComplete({
      orderId,
      liveRoomId,
      liveRoomItemId,
      paymentIntentId: pi.id,
    });
    return { outcome: "paid" };
  }
  if (pi.status === "requires_action" || pi.status === "requires_confirmation") {
    const cs = pi.client_secret;
    if (!cs) return { outcome: "error", code: "MISSING_CLIENT_SECRET" };
    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: { not: PAYMENT_PAID } },
      data: { paymentStatus: PAYMENT_REQUIRES_ACTION, stripePaymentIntentId: pi.id, status: "pending" },
    });
    return { outcome: "requires_action", clientSecret: cs, paymentIntentId: pi.id };
  }
  if (pi.status === "processing") {
    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: { not: PAYMENT_PAID } },
      data: { stripePaymentIntentId: pi.id, status: "pending", paymentStatus: PAYMENT_PENDING },
    });
    return { outcome: "processing" };
  }
  if (pi.status === "canceled" || pi.status === "requires_payment_method") {
    await prisma.order.updateMany({
      where: { id: orderId },
      data: { stripePaymentIntentId: null, paymentStatus: PAYMENT_FAILED, status: "cancelled" },
    });
    return null;
  }
  return null;
}

/**
 * Instant saved-card charge for a live sale-room buy-now order (no Stripe Checkout redirect).
 */
export async function chargeLiveBuyNowOrderWithSavedCard(args: {
  buyerId: string;
  orderId: string;
  liveRoomId: string;
  liveRoomItemId: string;
  paymentMethodId?: string | null;
}): Promise<ChargeOrderSavedPmOutcome> {
  if (!isStripeConfigured()) return { outcome: "error", code: "STRIPE_NOT_CONFIGURED" };

  const row = await prisma.order.findFirst({
    where: { id: args.orderId, buyerId: args.buyerId },
    include: {
      listing: { select: { id: true, buyingFormat: true, status: true, isCompanyListing: true } },
      seller: { select: { stripeAccountId: true, stripeOnboardingComplete: true } },
      liveShippingSession: { select: { liveShowId: true } },
    },
  });
  if (!row) return { outcome: "error", code: "ORDER_NOT_FOUND" };
  if (row.paymentStatus === PAYMENT_PAID) return { outcome: "paid" };
  if (row.paymentMethod === OrderPaymentMethod.escrow) return { outcome: "error", code: "USE_ESCROW_CHECKOUT" };
  if (row.listing.buyingFormat !== "buy_now" || row.listing.status !== "active") {
    return { outcome: "error", code: "ORDER_NOT_ELIGIBLE_SAVED_CARD" };
  }
  if (!row.seller.stripeAccountId || !row.seller.stripeOnboardingComplete) {
    return { outcome: "error", code: "SELLER_NOT_READY" };
  }

  let pmId = args.paymentMethodId?.trim() ?? row.paymentLabel?.trim() ?? "";
  if (!isStripePaymentMethodId(pmId)) {
    pmId = (await getBuyerDefaultCardPaymentMethodId(args.buyerId)) ?? "";
  }
  if (!isStripePaymentMethodId(pmId)) return { outcome: "error", code: "NO_SAVED_CARD" };
  try {
    await assertPaymentMethodOwnedByUser(args.buyerId, pmId);
  } catch (e) {
    const c = e instanceof Error ? e.message : "";
    return { outcome: "error", code: c || "PM_VALIDATION_FAILED" };
  }

  await syncLiveBundledShippingOnOrder(row.id);
  const orderFresh = await prisma.order.findUniqueOrThrow({
    where: { id: row.id },
    select: { totalUsd: true, itemPriceUsd: true, stripePaymentIntentId: true },
  });

  const liveRoomId = args.liveRoomId || row.liveShippingSession?.liveShowId || (await resolveLiveRoomIdForOrder(row.id));
  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: orderFresh.itemPriceUsd,
    isCompanyListing: Boolean(row.listing.isCompanyListing),
    liveRoomId,
  });
  const amountCents = Math.round(Math.max(0, orderFresh.totalUsd) * 100);
  if (amountCents < 50) return { outcome: "error", code: "INVALID_ORDER_AMOUNT" };

  const buyer = await prisma.user.findUnique({
    where: { id: args.buyerId },
    select: { stripeCustomerId: true },
  });
  const customerId = buyer?.stripeCustomerId?.trim();
  if (!customerId) return { outcome: "error", code: "BUYER_STRIPE_CUSTOMER_MISSING" };

  const stripe = getStripe();
  if (orderFresh.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(orderFresh.stripePaymentIntentId);
    const handled = await handleLiveBuyNowPaymentIntent(
      row.id,
      args.liveRoomId,
      args.liveRoomItemId,
      existing,
    );
    if (handled) return handled;
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
        // Live saved-card recovery: instant methods only.
        ...stripeOffSessionPaymentIntentOptions("live"),
        metadata: {
          orderId: row.id,
          kind: LIVE_BUY_NOW_PI_KIND,
          listingId: row.listingId,
          liveRoomId: args.liveRoomId,
          liveRoomItemId: args.liveRoomItemId,
          userId: args.buyerId,
        },
        application_fee_amount: feeCents,
        transfer_data: { destination: row.seller.stripeAccountId },
      },
      // Include the PM so a recovery retry with a new card does not replay the prior intent.
      { idempotencyKey: `live_buy_now_${row.id}_${amountCents}_${pmId}` },
    );

    await prisma.order.updateMany({
      where: { id: row.id },
      data: { paymentLabel: pmId, stripePaymentIntentId: intent.id },
    });

    const postCreate = await handleLiveBuyNowPaymentIntent(
      row.id,
      args.liveRoomId,
      args.liveRoomItemId,
      intent,
    );
    if (postCreate) return postCreate;

    await prisma.order.updateMany({
      where: { id: row.id, paymentStatus: { not: PAYMENT_PAID } },
      data: { paymentStatus: PAYMENT_FAILED, status: "cancelled" },
    });
    return { outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED" };
  } catch (e) {
    await prisma.order
      .updateMany({
        where: { id: row.id, paymentStatus: { not: PAYMENT_PAID } },
        data: { paymentStatus: PAYMENT_FAILED, status: "cancelled", stripePaymentIntentId: null },
      })
      .catch(() => {});
    const stripeDebug = buildStripeChargeErrorDebug(e, {
      amountCents,
      currency: "usd",
      customerId,
      paymentMethodId: pmId,
      destinationAccount: row.seller.stripeAccountId ?? null,
    });
    console.error("[payment recovery] stripe charge error", { orderId: row.id, ...stripeDebug });
    if (e instanceof Stripe.errors.StripeCardError) {
      return { outcome: "error", code: "CARD_DECLINED", stripeDebug };
    }
    return { outcome: "error", code: "STRIPE_ERROR", stripeDebug };
  }
}

export async function syncLiveBuyNowOrderPaymentIntent(args: {
  buyerId: string;
  orderId: string;
  liveRoomId: string;
  liveRoomItemId: string;
}): Promise<ChargeOrderSavedPmOutcome> {
  if (!isStripeConfigured()) return { outcome: "error", code: "STRIPE_NOT_CONFIGURED" };
  const row = await prisma.order.findFirst({
    where: { id: args.orderId, buyerId: args.buyerId },
    select: { id: true, paymentStatus: true, stripePaymentIntentId: true },
  });
  if (!row) return { outcome: "error", code: "ORDER_NOT_FOUND" };
  if (row.paymentStatus === PAYMENT_PAID) return { outcome: "paid" };
  if (!row.stripePaymentIntentId) return { outcome: "error", code: "NO_PAYMENT_INTENT" };

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(row.stripePaymentIntentId);
  const handled = await handleLiveBuyNowPaymentIntent(
    row.id,
    args.liveRoomId,
    args.liveRoomItemId,
    pi,
  );
  return handled ?? { outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED" };
}

/** After `confirmCardPayment` on the client, poll Stripe and finalize when succeeded. */
export async function syncMarketplaceOrderPaymentIntent(args: {
  buyerId: string;
  orderId: string;
}): Promise<ChargeOrderSavedPmOutcome> {
  await processAuctionPaymentExpiries();
  if (!isStripeConfigured()) return { outcome: "error", code: "STRIPE_NOT_CONFIGURED" };

  const row = await prisma.order.findFirst({
    where: { id: args.orderId, buyerId: args.buyerId },
    select: { id: true, paymentStatus: true, stripePaymentIntentId: true, paymentMethod: true },
  });
  if (!row) return { outcome: "error", code: "ORDER_NOT_FOUND" };
  if (row.paymentMethod === OrderPaymentMethod.escrow) return { outcome: "error", code: "USE_ESCROW_CHECKOUT" };
  if (row.paymentStatus === PAYMENT_PAID) return { outcome: "paid" };
  if (!row.stripePaymentIntentId) return { outcome: "error", code: "NO_PAYMENT_INTENT" };

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(row.stripePaymentIntentId);
  const handled = await handleRetrievedPaymentIntent(row.id, pi);
  return handled ?? { outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED" };
}
