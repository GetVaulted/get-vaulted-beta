import Stripe from "stripe";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { EscrowStatus, OrderPaymentMethod, OrderRefundRequestStatus } from "@/generated/prisma/enums";
import { createNotification } from "@/lib/notifications";
import { scheduleOrderLifecycleEmail } from "@/lib/order-lifecycle-email";
import {
  commitReferralCreditReservation,
  grantReferralCreditsForQualifyingOrder,
  releaseReferralCreditReservation,
  reserveReferralCreditForCheckout,
} from "@/lib/referral-credit";
import { estimateEscrowFeeCents, isEscrowConfigured, orderTotalQualifiesForEscrow } from "@/lib/escrow-config";
import { prisma } from "@/lib/prisma";
import {
  consumeListingInventoryHoldTx,
  releaseActiveInventoryHoldFromBuyNowStripeMetadata,
  releaseActiveInventoryHoldsForListingAndBuyerTx,
  releaseActiveInventoryHoldsForOrderId,
  reserveListingInventoryHoldTx,
} from "@/lib/live-auction-inventory-hold";
import {
  assertMarketplaceOrderPaymentIntentMatchesOrder,
  isMarketplaceOrderPaymentIntentKind,
  logIgnoredMarketplacePaymentIntentWebhook,
} from "@/lib/stripe-payment-intent-webhook";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { buildOrderTaxPersistFields } from "@/lib/sales-tax-order";
import { recordTaxDestinationVolumeOnOrderPaid } from "@/lib/sales-tax-reporting";
import {
  buildCheckoutTaxSessionFields,
  buildMarketplaceCheckoutTaxBundle,
  connectCheckoutPaymentIntentData,
  loadSellerShipFromForTax,
  fetchCheckoutSessionTax,
  fetchPaymentIntentTax,
  recordStripeTaxTransaction,
  STRIPE_TAX_CODE_SHIPPING,
  STRIPE_TAX_CODE_TANGIBLE,
  stripeLineItemProductData,
  TAX_PROVIDER_STRIPE,
} from "@/lib/stripe-tax";
import {
  resolveBuyNowCheckoutLane,
  resolveOrderCheckoutLane,
  stripeCheckoutSessionPaymentOptions,
} from "@/lib/stripe-payment-method-config";
import {
  buyNowCheckoutSubtotalCents,
  reuseOpenCheckoutSessionIfMatching,
} from "@/lib/stripe-checkout-session";
import { fetchCheckoutSessionChargeBreakdown } from "@/lib/stripe-checkout-breakdown";
import {
  getLiveRoomCompletedSalesGmvUsd,
  recordLiveShowCompletedSaleTx,
  resolveCheckoutApplicationFeeCents,
  resolveLiveRoomIdForLiveRoomItem,
  resolveLiveRoomIdForOrder,
} from "@/lib/live-show-gmv";
import { syncStripeConnectUserRowsForAccountId } from "@/lib/sync-stripe-connect-user";
import { emitLiveRoomMessagesRefetch, emitPurchaseCompleted } from "@/lib/realtime-emit-server";
import { ensureLiveRoomPaymentFailureRecorded } from "@/lib/live-room-payment-failure";
import { LIVE_BUY_NOW_PI_KIND, chargeMarketplaceBuyNowOrderWithSavedCard } from "@/lib/stripe-charge-order-saved-pm";
import { finalizeLiveTipPaid, markLiveTipCheckoutFailed } from "@/services/live-tips";
import { SELLER_COMMERCE_KIND, logSellerCommerceEvent } from "@/lib/seller-commerce-event";
import { logEscrowStatusTransition } from "@/lib/escrow-audit-log";
import { getEscrowProvider } from "@/services/escrow/factory";
import { assertValidEscrowTransition } from "@/services/escrow/state-machine";
import { emitOrderLifecycleSync } from "@/lib/marketplace/ecosystem-sync";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import {
  assertBuyNowAllowed,
  CommerceGuardError,
  loadListingCommerceContext,
} from "@/lib/marketplace/commerce-guards";
import { resolveMarketplaceCheckoutShipping } from "@/services/marketplace-checkout-shipping";
import { LayawayStatus } from "@/generated/prisma/enums";
import { initializeOrderPayoutOnPayment } from "@/services/payout/process-delivery-payout";
import { reverseLiveShowCompletedSaleTx } from "@/lib/live-show-gmv";
import {
  addOrderToLiveShippingSessionTx,
  estimateFirstItemLiveShippingCentsForListingTx,
  removeOrderFromLiveShippingSessionOnRefundTx,
} from "@/services/shipping/live-shipping-pricing";
import { syncOrderShippingFromLiveSessionTx } from "@/services/shipping/live-commerce-shipping-settlement";

/** @remarks Conceptually `payment_pending` — persisted value for compatibility. */
export const PAYMENT_PENDING = "pending_payment" as const;
export const PAYMENT_PAID = "paid" as const;
/** @remarks Conceptually `payment_failed` — persisted value for compatibility. */
export const PAYMENT_FAILED = "failed" as const;
export const PAYMENT_REFUNDED = "refunded" as const;
/** Auction winner did not complete checkout before `paymentDeadlineAt`. */
export const PAYMENT_EXPIRED = "expired" as const;
/** Stripe dispute (chargeback) lost against the seller — feeds seller risk scoring. */
export const PAYMENT_CHARGEBACK = "chargeback" as const;
/** Stripe PaymentIntent requires on-session authentication (SCA). */
export const PAYMENT_REQUIRES_ACTION = "payment_requires_action" as const;

export const AUCTION_WINNER_PAYMENT_WINDOW_MS = 30 * 60 * 1000;

/**
 * Marks unpaid auction-winner orders past `paymentDeadlineAt` as expired and moves listings to
 * `auction_ended_unpaid`. Idempotent; safe to call on reads and before checkout.
 */
export async function processAuctionPaymentExpiries(): Promise<void> {
  const now = new Date();
  const due = await prisma.order.findMany({
    where: {
      paymentStatus: { in: [PAYMENT_PENDING, PAYMENT_REQUIRES_ACTION] },
      paymentDeadlineAt: { not: null, lt: now },
      listing: {
        buyingFormat: "auction",
        status: "awaiting_auction_payment",
        moderationRemovedAt: null,
      },
    },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      listingId: true,
      listing: { select: { title: true } },
    },
  });

  for (const o of due) {
    const titleShort = o.listing.title.length > 80 ? `${o.listing.title.slice(0, 77)}…` : o.listing.title;
    const changed = await prisma.$transaction(async (tx) => {
      const u = await tx.order.updateMany({
        where: {
          id: o.id,
          paymentStatus: { in: [PAYMENT_PENDING, PAYMENT_REQUIRES_ACTION] },
          paymentDeadlineAt: { not: null, lt: now },
        },
        data: { paymentStatus: PAYMENT_EXPIRED, status: "cancelled" },
      });
      if (u.count === 0) return false;
      await tx.listing.updateMany({
        where: { id: o.listingId, status: "awaiting_auction_payment" },
        data: { status: "auction_ended_unpaid" },
      });
      await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, { listingId: o.listingId, userId: o.buyerId });
      return true;
    });
    if (!changed) continue;
    releaseReferralCreditReservation(o.id).catch((e) =>
      console.error("[referral-credit] release failed (auction payment expired)", { orderId: o.id, error: e }),
    );
    await createNotification(prisma, {
      userId: o.buyerId,
      type: "auction_payment_expired",
      title: "Your payment window expired",
      body: `Your payment window expired for “${titleShort}”.`,
      href: `/orders/${encodeURIComponent(o.id)}`,
    });
    await createNotification(prisma, {
      userId: o.sellerId,
      type: "auction_payment_expired_seller",
      title: "Winner payment expired",
      body: `The winner did not pay in time for “${titleShort}”. Open My listings or Sales to relist, offer to the next bidder, or cancel the result.`,
      href: "/account/listings",
    });
    await logSellerCommerceEvent({
      sellerId: o.sellerId,
      listingId: o.listingId,
      orderId: o.id,
      kind: SELLER_COMMERCE_KIND.auctionWinnerPaymentExpired,
      title: "Winner payment expired",
      body: `No payment for “${titleShort}” before the deadline. Choose what to do next in recovery options.`,
    });
  }

  try {
    await reconcileStalePendingCheckoutSessionsGlobal();
  } catch (e) {
    console.error("[payments] reconcileStalePendingCheckoutSessionsGlobal", e);
  }
}

function siteUrl(): string {
  const u = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return u.replace(/\/$/, "");
}

/** Stripe's minimum chargeable amount — never let a referral-credit discount push a charge below this. */
const MIN_STRIPE_CHARGE_USD = 0.5;

type ReferralCreditCheckoutFields = {
  itemPriceUsd: number;
  totalUsd: number;
  referralCreditAppliedUsd: number;
};

/**
 * Buy Now: `createBuyNowCheckoutSession`'s enclosing transaction always (re)computes
 * `itemPriceUsd`/`totalUsd` from the listing's full, undiscounted price — on both brand-new orders
 * and every "resume an existing pending checkout" branch — since the transaction has no knowledge
 * of referral credit (reservation happens after it commits, per `reserveReferralCreditForCheckout`'s
 * non-transactional contract). So any previously-reserved credit for this exact order (tracked in
 * `referralCreditAppliedUsd`, untouched by the transaction) must be re-subtracted here on every call
 * rather than re-reserved — re-reserving would double-spend the buyer's credit.
 */
async function applyReferralCreditForBuyNowOrder(
  order: {
    id: string;
    itemPriceUsd: number;
    shippingPriceUsd: number;
    taxUsd: number;
    referralCreditAppliedUsd: number;
  },
  buyerId: string,
): Promise<ReferralCreditCheckoutFields> {
  const unchanged = {
    itemPriceUsd: order.itemPriceUsd,
    totalUsd: order.itemPriceUsd + order.shippingPriceUsd + order.taxUsd,
    referralCreditAppliedUsd: order.referralCreditAppliedUsd,
  };

  if (order.referralCreditAppliedUsd > 0) {
    const reapply = Math.min(
      order.referralCreditAppliedUsd,
      Math.max(0, order.itemPriceUsd - MIN_STRIPE_CHARGE_USD),
    );
    if (reapply <= 0) return unchanged;
    const itemPriceUsd = order.itemPriceUsd - reapply;
    const totalUsd = itemPriceUsd + order.shippingPriceUsd + order.taxUsd;
    await prisma.order.update({ where: { id: order.id }, data: { itemPriceUsd, totalUsd } });
    return { itemPriceUsd, totalUsd, referralCreditAppliedUsd: reapply };
  }

  try {
    const maxApplyUsd = Math.max(0, order.itemPriceUsd - MIN_STRIPE_CHARGE_USD);
    if (maxApplyUsd <= 0) return unchanged;
    const reserved = await reserveReferralCreditForCheckout(buyerId, maxApplyUsd, order.id);
    if (reserved <= 0) return unchanged;
    const itemPriceUsd = order.itemPriceUsd - reserved;
    const totalUsd = itemPriceUsd + order.shippingPriceUsd + order.taxUsd;
    await prisma.order.update({
      where: { id: order.id },
      data: { itemPriceUsd, totalUsd, referralCreditAppliedUsd: reserved },
    });
    return { itemPriceUsd, totalUsd, referralCreditAppliedUsd: reserved };
  } catch (e) {
    console.error("[referral-credit] reserve failed (buy now checkout)", { orderId: order.id, error: e });
    return unchanged;
  }
}

/**
 * Pay-order (accepted offers, counter-offers, and auction winners paying via
 * `createPayOrderCheckoutSession`): unlike Buy Now, this order's `itemPriceUsd` is set once at
 * order creation and never reset by this function — so once credit has been reserved and applied
 * for this order, `itemPriceUsd` already reflects the discount and must not be discounted again.
 */
async function applyReferralCreditForPayOrder(
  order: {
    id: string;
    itemPriceUsd: number;
    shippingPriceUsd: number;
    taxUsd: number;
    referralCreditAppliedUsd: number;
  },
  buyerId: string,
): Promise<ReferralCreditCheckoutFields> {
  const unchanged = {
    itemPriceUsd: order.itemPriceUsd,
    totalUsd: order.itemPriceUsd + order.shippingPriceUsd + order.taxUsd,
    referralCreditAppliedUsd: order.referralCreditAppliedUsd,
  };
  if (order.referralCreditAppliedUsd > 0) return unchanged;

  try {
    const maxApplyUsd = Math.max(0, order.itemPriceUsd - MIN_STRIPE_CHARGE_USD);
    if (maxApplyUsd <= 0) return unchanged;
    const reserved = await reserveReferralCreditForCheckout(buyerId, maxApplyUsd, order.id);
    if (reserved <= 0) return unchanged;
    const itemPriceUsd = order.itemPriceUsd - reserved;
    const totalUsd = itemPriceUsd + order.shippingPriceUsd + order.taxUsd;
    await prisma.order.update({
      where: { id: order.id },
      data: { itemPriceUsd, totalUsd, referralCreditAppliedUsd: reserved },
    });
    return { itemPriceUsd, totalUsd, referralCreditAppliedUsd: reserved };
  } catch (e) {
    console.error("[referral-credit] reserve failed (pay order checkout)", { orderId: order.id, error: e });
    return unchanged;
  }
}

/**
 * Resolve the Order a disputed/charged-back PaymentIntent belongs to. A plain Stripe/escrow order
 * has exactly one PaymentIntent, stored directly on `Order.stripePaymentIntentId`. A layaway order
 * is paid across several separate PaymentIntents (deposit, each installment, balance payoff) — none
 * of which is copied onto `Order.stripePaymentIntentId` — so a dispute on any installment other than
 * the (informational) one recorded at completion would otherwise silently fail to match any order,
 * leaving payout unfrozen and the chargeback unrecorded. Fall back to `LayawayPayment` → `Layaway` →
 * `orderId` to cover every layaway charge.
 */
export async function resolveOrderIdForDisputedPaymentIntent(paymentIntentId: string): Promise<string | null> {
  const direct = await prisma.order.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true },
  });
  if (direct) return direct.id;
  const layawayPayment = await prisma.layawayPayment.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { layaway: { select: { orderId: true } } },
  });
  return layawayPayment?.layaway.orderId ?? null;
}

function throwFromCommerceGuard(e: unknown): never {
  if (e instanceof CommerceGuardError) {
    switch (e.code) {
      case "ITEM_RESERVED_ON_LAYAWAY":
        throw new Error("LISTING_LAYAWAY_LOCKED");
      case "ITEM_NOT_AVAILABLE":
        throw new Error("NOT_AVAILABLE");
      case "USE_LAYAWAY_PAYOFF":
        throw new Error("USE_LAYAWAY_PAYOFF");
      case "ALREADY_SOLD":
        throw new Error("ALREADY_SOLD");
      case "CHECKOUT_IN_PROGRESS":
        throw new Error("CHECKOUT_IN_PROGRESS");
      case "OWN_LISTING":
        throw new Error("OWN_LISTING");
      default:
        throw new Error("NOT_AVAILABLE");
    }
  }
  throw e;
}

/**
 * Escrow provider confirmed buyer funds are secured — mirror Stripe `finalizeStripeMarketplaceOrderPaid` marketplace
 * effects (listing sold, seller ship) without Stripe payout fields.
 */
export async function applyEscrowBuyerFundsSecured(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      listingId: true,
      buyerId: true,
      sellerId: true,
      paymentStatus: true,
      paymentMethod: true,
      escrowStatus: true,
      escrowProvider: true,
      escrowTransactionId: true,
      shippingPriceUsd: true,
      itemPriceUsd: true,
      taxUsd: true,
      liveShippingSession: { select: { liveShowId: true } },
      listing: { select: { title: true, buyingFormat: true } },
    },
  });
  if (!order || order.paymentMethod !== OrderPaymentMethod.escrow) return;
  if (order.paymentStatus === PAYMENT_PAID || order.paymentStatus === PAYMENT_EXPIRED) return;

  const prevEscrow = order.escrowStatus;
  try {
    assertValidEscrowTransition(prevEscrow, EscrowStatus.buyer_paid);
  } catch (e) {
    console.error("[applyEscrowBuyerFundsSecured] invalid escrow transition", order.id, e);
    return;
  }

  const shippingChargedCents = Math.round(Math.max(0, order.shippingPriceUsd) * 100);

  const { closedLayaways } = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PAYMENT_PAID,
        status: "paid",
        escrowStatus: EscrowStatus.buyer_paid,
        shippingChargedCents,
      },
    });

    await tx.listing.updateMany({
      where: {
        id: order.listingId,
        status: { in: ["active", "auction_live", "awaiting_auction_payment", "layaway_reserved"] },
        moderationRemovedAt: null,
      },
      data: { status: "sold" },
    });

    const { closeActiveLayawaysSupersededByMarketplacePurchaseTx } = await import("@/services/layaway");
    const closedLayaways = await closeActiveLayawaysSupersededByMarketplacePurchaseTx(tx, {
      listingId: order.listingId,
      winningOrderId: orderId,
      winningBuyerId: order.buyerId,
    });

    await consumeListingInventoryHoldTx(tx, {
      listingId: order.listingId,
      userId: order.buyerId,
      orderId,
    });

    const liveRoomId = order.liveShippingSession?.liveShowId ?? null;
    if (liveRoomId) {
      await recordLiveShowCompletedSaleTx(tx, liveRoomId, order.itemPriceUsd);
    }

    return { closedLayaways };
  });

  if (prevEscrow !== EscrowStatus.buyer_paid) {
    await logEscrowStatusTransition({
      sellerId: order.sellerId,
      listingId: order.listingId,
      orderId: order.id,
      provider: order.escrowProvider,
      escrowTransactionId: order.escrowTransactionId,
      previousStatus: prevEscrow,
      newStatus: EscrowStatus.buyer_paid,
      source: "system",
    });
  }

  void initializeOrderPayoutOnPayment(orderId);

  const lt = order.listing.title.length > 90 ? `${order.listing.title.slice(0, 87)}…` : order.listing.title;
  await createNotification(prisma, {
    userId: order.sellerId,
    type: "seller_ready_to_ship",
    title: "Payment received — ready to ship",
    body: `“${lt}” is paid. Create a shipping label from Sales or mark shipped when you send.`,
    href: `/orders/${encodeURIComponent(orderId)}`,
  });
  await createNotification(prisma, {
    userId: order.buyerId,
    type: "purchase_complete",
    title: "Payment confirmed",
    body: `Your order for “${lt}” payment is confirmed.`,
    href: `/orders/${encodeURIComponent(orderId)}`,
  });
  scheduleOrderLifecycleEmail({
    userId: order.sellerId,
    kind: "seller_ready_to_ship",
    orderId,
    listingTitle: order.listing.title,
  });
  scheduleOrderLifecycleEmail({
    userId: order.buyerId,
    kind: "purchase_complete",
    orderId,
    listingTitle: order.listing.title,
    totalUsd: order.itemPriceUsd + order.shippingPriceUsd + order.taxUsd,
  });

  emitOrderLifecycleSync({
    orderId,
    parties: { sellerId: order.sellerId, buyerId: order.buyerId },
    listingId: order.listingId,
    orderStatus: "paid",
    paymentStatus: PAYMENT_PAID,
    listingStatus: "sold",
  });

  for (const lay of closedLayaways) {
    const { emitLayawayLifecycleSync } = await import("@/lib/marketplace/ecosystem-sync");
    const sameOrder = lay.orderId === orderId;
    emitLayawayLifecycleSync({
      typedEvent: sameOrder ? "layaway_paid_in_full" : "layaway_canceled",
      layawayId: lay.id,
      parties: { sellerId: lay.sellerId, buyerId: lay.buyerId },
      listingId: lay.listingId,
      orderId: lay.orderId,
      layawayStatus: sameOrder ? "completed" : "canceled",
      listingStatus: "sold",
      orderStatus: "paid",
      paymentStatus: PAYMENT_PAID,
      extraPayload: { supersededByOrderId: orderId },
    });
    if (!sameOrder) {
      const { refundSupersededLayawayPayments } = await import("@/services/layaway");
      await refundSupersededLayawayPayments(lay.id).catch((e) =>
        console.error("[payments] superseded layaway refund failed", lay.id, e),
      );
    }
  }
}

export type BuyNowShippingInput = {
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  buyerAddressId?: string | null;
  /** Shippo rate object id chosen by buyer (required when listing shippingPriceUsd is 0). */
  selectedShippingRateId?: string | null;
};

/**
 * Buy now: create unpaid order + Stripe Checkout (MVP default). When `ESCROW_ENABLED=true` and provider
 * env is configured, high-value totals may use the alternate checkout path. Listing stays active until
 * payment is confirmed (Stripe or provider webhooks).
 *
 * Pass `embedded: true` to charge the buyer's saved Vault Wallet card in-app (no Stripe Checkout redirect).
 */
export type BuyNowEmbeddedCheckoutResult = {
  embedded: true;
  orderId: string;
} & (
  | { paid: true }
  | { requiresAction: true; clientSecret: string; paymentIntentId: string }
  | { processing: true }
);

type BuyNowCheckoutSessionArgs = {
  buyerId: string;
  listingId: string;
  liveRoomItemId?: string | null;
  shipping: BuyNowShippingInput;
  successPath?: string;
  cancelPath?: string;
  paymentMethodId?: string | null;
};

export async function createBuyNowCheckoutSession(
  args: BuyNowCheckoutSessionArgs & { embedded?: false | undefined },
): Promise<{ url: string }>;
export async function createBuyNowCheckoutSession(
  args: BuyNowCheckoutSessionArgs & { embedded: true },
): Promise<BuyNowEmbeddedCheckoutResult>;
export async function createBuyNowCheckoutSession(
  args: BuyNowCheckoutSessionArgs & { embedded?: boolean },
): Promise<{ url: string } | BuyNowEmbeddedCheckoutResult>;
export async function createBuyNowCheckoutSession(args: BuyNowCheckoutSessionArgs & { embedded?: boolean }): Promise<
  { url: string } | BuyNowEmbeddedCheckoutResult
> {
  const base = siteUrl();
  const successUrl = `${base}${args.successPath ?? "/account/orders"}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${base}${args.cancelPath ?? `/marketplace/${encodeURIComponent(args.listingId)}`}`;

  const listingPeek = await prisma.listing.findUnique({
    where: { id: args.listingId },
    select: { priceUsd: true, shippingPriceUsd: true, sellerId: true, shipFromAddressId: true },
  });
  if (!listingPeek) throw new Error("NOT_BUY_NOW");

  const buyNowPreflight = await loadListingCommerceContext(prisma, args.listingId);
  if (!buyNowPreflight) throw new Error("NOT_BUY_NOW");
  try {
    assertBuyNowAllowed(buyNowPreflight, args.buyerId);
  } catch (e) {
    throwFromCommerceGuard(e);
  }

  let liveShipUpperCents = 0;
  if (args.liveRoomItemId?.trim()) {
    const liPeek = await prisma.liveRoomItem.findFirst({
      where: {
        id: args.liveRoomItemId.trim(),
        listingId: args.listingId,
        status: "active",
        liveRoom: { sellerId: listingPeek.sellerId, status: "live", roomType: "sale" },
      },
      select: { id: true },
    });
    if (!liPeek) throw new Error("LIVE_ITEM_INVALID");
    liveShipUpperCents = await prisma.$transaction((tx) =>
      estimateFirstItemLiveShippingCentsForListingTx(tx, args.listingId),
    );
  }

  const thresholdTotal =
    listingPeek.priceUsd + Math.max(listingPeek.shippingPriceUsd, liveShipUpperCents / 100);
  const useEscrow = orderTotalQualifiesForEscrow(thresholdTotal) && isEscrowConfigured();
  if (orderTotalQualifiesForEscrow(thresholdTotal) && !isEscrowConfigured()) {
    throw new Error("ESCROW_NOT_CONFIGURED");
  }

  const existingPre = await prisma.order.findUnique({
    where: { listingId: args.listingId },
    select: {
      id: true,
      buyerId: true,
      paymentStatus: true,
      paymentMethod: true,
      stripeCheckoutSessionId: true,
      escrowCheckoutUrl: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
    },
  });

  if (existingPre?.paymentStatus === PAYMENT_PENDING && existingPre.buyerId !== args.buyerId) {
    throw new Error("CHECKOUT_IN_PROGRESS");
  }

  if (
    existingPre?.paymentStatus === PAYMENT_PENDING &&
    existingPre.paymentMethod === OrderPaymentMethod.escrow &&
    existingPre.buyerId === args.buyerId &&
    existingPre.escrowCheckoutUrl
  ) {
    return { url: existingPre.escrowCheckoutUrl };
  }

  if (
    existingPre?.paymentStatus === PAYMENT_PENDING &&
    existingPre.paymentMethod === OrderPaymentMethod.escrow &&
    existingPre.buyerId === args.buyerId &&
    !existingPre.escrowCheckoutUrl &&
    useEscrow
  ) {
    const prov = getEscrowProvider();
    const r = await prov.createEscrowTransaction(existingPre.id);
    await prisma.order.update({
      where: { id: existingPre.id },
      data: {
        escrowTransactionId: r.transactionId,
        escrowCheckoutUrl: r.checkoutUrl,
        escrowProvider: prov.name,
        escrowFeeCents: estimateEscrowFeeCents(
          existingPre.itemPriceUsd + existingPre.shippingPriceUsd + existingPre.taxUsd,
        ),
        ...(r.trustapBuyerUserId ? { trustapBuyerUserId: r.trustapBuyerUserId } : {}),
      },
    });
    return { url: r.checkoutUrl };
  }

  let deletedOrderIdForCreditRelease: string | null = null;
  let resolvedMarketplaceShipping: Awaited<ReturnType<typeof resolveMarketplaceCheckoutShipping>> | null = null;
  if (!args.liveRoomItemId?.trim()) {
    resolvedMarketplaceShipping = await resolveMarketplaceCheckoutShipping({
      listingId: args.listingId,
      shipTo: {
        shipRecipientName: args.shipping.shipRecipientName,
        shipAddress: args.shipping.shipAddress,
        shipCity: args.shipping.shipCity,
        shipState: args.shipping.shipState,
        shipZip: args.shipping.shipZip,
        shipCountry: args.shipping.shipCountry,
      },
      selectedShippingRateId: args.shipping.selectedShippingRateId,
    });
  }

  const { order, listing, liveRoomItemId } = await prisma.$transaction(async (tx) => {
    const listingRow = await tx.listing.findUnique({
      where: { id: args.listingId },
      select: {
        id: true,
        title: true,
        sellerId: true,
        status: true,
        buyingFormat: true,
        priceUsd: true,
        shippingPriceUsd: true,
        shipFromAddressId: true,
        moderationRemovedAt: true,
        isCompanyListing: true,
        seller: {
          select: { stripeAccountId: true, stripeOnboardingComplete: true, trustapUserId: true },
        },
      },
    });
    if (!listingRow || listingRow.buyingFormat !== "buy_now") throw new Error("NOT_BUY_NOW");
    if (listingRow.moderationRemovedAt) throw new Error("NOT_AVAILABLE");
    if (listingRow.sellerId === args.buyerId) throw new Error("OWN_LISTING");

    const commerceCtx = await loadListingCommerceContext(tx, listingRow.id);
    if (!commerceCtx) throw new Error("NOT_BUY_NOW");
    try {
      assertBuyNowAllowed(commerceCtx, args.buyerId);
    } catch (e) {
      throwFromCommerceGuard(e);
    }

    const itemPriceUsd = listingRow.priceUsd;
    const taxUsd = 0;

    let liveRoomItemIdOut: string | null = null;
    if (args.liveRoomItemId?.trim()) {
      const li = await tx.liveRoomItem.findFirst({
        where: {
          id: args.liveRoomItemId.trim(),
          listingId: listingRow.id,
          status: "active",
          liveRoom: { sellerId: listingRow.sellerId, status: "live", roomType: "sale" },
        },
        select: { id: true },
      });
      if (!li) throw new Error("LIVE_ITEM_INVALID");
      liveRoomItemIdOut = li.id;
    }

    const liveShipEstimateCents = liveRoomItemIdOut
      ? await estimateFirstItemLiveShippingCentsForListingTx(tx, listingRow.id)
      : 0;
    const marketplaceShippingUsd =
      resolvedMarketplaceShipping?.shippingPriceUsd ?? listingRow.shippingPriceUsd;
    const escrowSubtotalUsd =
      itemPriceUsd + (liveRoomItemIdOut ? liveShipEstimateCents / 100 : marketplaceShippingUsd) + taxUsd;
    const rowUseEscrow = orderTotalQualifiesForEscrow(escrowSubtotalUsd) && isEscrowConfigured();

    if (
      rowUseEscrow &&
      process.env.TRUSTAP_USE_STUB_RESPONSE !== "1" &&
      !listingRow.seller.trustapUserId?.trim()
    ) {
      throw new Error("TRUSTAP_SELLER_NOT_LINKED");
    }

    if (!rowUseEscrow) {
      if (!listingRow.seller.stripeAccountId || !listingRow.seller.stripeOnboardingComplete) {
        throw new Error("SELLER_NOT_READY");
      }
    }

    const existing = await tx.order.findUnique({ where: { listingId: listingRow.id } });
    if (existing && existing.paymentStatus === PAYMENT_PAID) throw new Error("ALREADY_SOLD");
    if (
      existing &&
      (existing.paymentMethod === OrderPaymentMethod.layaway ||
        existing.paymentStatus === PAYMENT_LAYAWAY_ACTIVE)
    ) {
      if (existing.buyerId !== args.buyerId) throw new Error("LISTING_LAYAWAY_LOCKED");
      throw new Error("USE_LAYAWAY_PAYOFF");
    }
    if (existing && existing.paymentStatus === PAYMENT_PENDING) {
      if (existing.buyerId !== args.buyerId) throw new Error("CHECKOUT_IN_PROGRESS");
      if (
        existing.paymentMethod === OrderPaymentMethod.escrow &&
        !existing.escrowCheckoutUrl &&
        existing.buyerId === args.buyerId
      ) {
        await reserveListingInventoryHoldTx(tx, {
          listingId: listingRow.id,
          userId: args.buyerId,
          source: "buy_now_checkout",
          liveRoomItemId: liveRoomItemIdOut,
        });
        return { order: existing, listing: listingRow, liveRoomItemId: liveRoomItemIdOut };
      }
      if (existing.paymentMethod === OrderPaymentMethod.stripe && existing.buyerId === args.buyerId) {
        await reserveListingInventoryHoldTx(tx, {
          listingId: listingRow.id,
          userId: args.buyerId,
          source: "buy_now_checkout",
          liveRoomItemId: liveRoomItemIdOut,
        });
        const pendingShippingUsd = liveRoomItemIdOut ? 0 : marketplaceShippingUsd;
        const pendingTotalUsd = itemPriceUsd + pendingShippingUsd + taxUsd;
        let orderOut = await tx.order.update({
          where: { id: existing.id },
          data: {
            itemPriceUsd,
            shippingPriceUsd: pendingShippingUsd,
            taxUsd,
            totalUsd: pendingTotalUsd,
            carrier: liveRoomItemIdOut ? null : resolvedMarketplaceShipping?.carrier ?? null,
            service: liveRoomItemIdOut ? null : resolvedMarketplaceShipping?.service ?? null,
            shipRecipientName: args.shipping.shipRecipientName,
            shipAddress: args.shipping.shipAddress,
            shipCity: args.shipping.shipCity,
            shipState: args.shipping.shipState,
            shipZip: args.shipping.shipZip,
            shipCountry: args.shipping.shipCountry,
            buyerAddressId: args.shipping.buyerAddressId ?? null,
            sellerShipFromAddressId: listingRow.shipFromAddressId ?? null,
          },
        });
        if (liveRoomItemIdOut) {
          const liRoom = await tx.liveRoomItem.findUnique({
            where: { id: liveRoomItemIdOut },
            select: { liveRoomId: true },
          });
          await addOrderToLiveShippingSessionTx(tx, orderOut.id, {
            liveShowId: liRoom?.liveRoomId ?? null,
          });
          orderOut = await syncOrderShippingFromLiveSessionTx(tx, orderOut.id);
        }
        return { order: orderOut, listing: listingRow, liveRoomItemId: liveRoomItemIdOut };
      }
      if (existing.paymentMethod === OrderPaymentMethod.stripe) throw new Error("CHECKOUT_IN_PROGRESS");
      if (existing.paymentMethod === OrderPaymentMethod.escrow && existing.escrowCheckoutUrl) {
        throw new Error("CHECKOUT_IN_PROGRESS");
      }
    }
    if (existing && existing.paymentStatus === PAYMENT_FAILED) {
      const linkedLayaway = await tx.layaway.findFirst({
        where: { orderId: existing.id, status: LayawayStatus.active },
        select: { id: true },
      });
      if (linkedLayaway) {
        await tx.layaway.update({
          where: { id: linkedLayaway.id },
          data: { status: LayawayStatus.refunded, remainingBalanceUsd: 0 },
        });
        await tx.listing.updateMany({
          where: { id: listingRow.id, status: "layaway_reserved" },
          data: { status: "active" },
        });
      }
      await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
        listingId: listingRow.id,
        userId: existing.buyerId,
      });
      await tx.order.delete({ where: { id: existing.id } });
      deletedOrderIdForCreditRelease = existing.id;
    }

    const initialShippingUsd = liveRoomItemIdOut ? 0 : marketplaceShippingUsd;
    const initialTotalUsd = itemPriceUsd + initialShippingUsd + taxUsd;
    const escrowFeeCents = rowUseEscrow ? estimateEscrowFeeCents(escrowSubtotalUsd) : 0;

    await reserveListingInventoryHoldTx(tx, {
      listingId: listingRow.id,
      userId: args.buyerId,
      source: "buy_now_checkout",
      liveRoomItemId: liveRoomItemIdOut,
    });

    const orderRow = await tx.order.create({
      data: {
        listingId: listingRow.id,
        buyerId: args.buyerId,
        sellerId: listingRow.sellerId,
        itemPriceUsd,
        shippingPriceUsd: initialShippingUsd,
        taxUsd,
        totalUsd: initialTotalUsd,
        status: "pending",
        paymentStatus: PAYMENT_PENDING,
        fulfillmentStatus: "pending",
        carrier: liveRoomItemIdOut ? null : resolvedMarketplaceShipping?.carrier ?? null,
        service: liveRoomItemIdOut ? null : resolvedMarketplaceShipping?.service ?? null,
        shipRecipientName: args.shipping.shipRecipientName,
        shipAddress: args.shipping.shipAddress,
        shipCity: args.shipping.shipCity,
        shipState: args.shipping.shipState,
        shipZip: args.shipping.shipZip,
        shipCountry: args.shipping.shipCountry,
        buyerAddressId: args.shipping.buyerAddressId ?? null,
        sellerShipFromAddressId: listingRow.shipFromAddressId ?? null,
        paymentMethod: rowUseEscrow ? OrderPaymentMethod.escrow : OrderPaymentMethod.stripe,
        escrowStatus: rowUseEscrow ? EscrowStatus.pending : null,
        escrowFeeCents,
        paymentLabel: rowUseEscrow ? "escrow_checkout" : "stripe_checkout",
      },
    });

    let orderOut = orderRow;
    if (liveRoomItemIdOut) {
      const liRoom = await tx.liveRoomItem.findUnique({
        where: { id: liveRoomItemIdOut },
        select: { liveRoomId: true },
      });
      await addOrderToLiveShippingSessionTx(tx, orderRow.id, {
        liveShowId: liRoom?.liveRoomId ?? null,
      });
      orderOut = await syncOrderShippingFromLiveSessionTx(tx, orderRow.id);
      if (rowUseEscrow) {
        orderOut = await tx.order.update({
          where: { id: orderOut.id },
          data: {
            escrowFeeCents: estimateEscrowFeeCents(
              orderOut.itemPriceUsd + orderOut.shippingPriceUsd + orderOut.taxUsd,
            ),
          },
        });
      }
    }

    return { order: orderOut, listing: listingRow, liveRoomItemId: liveRoomItemIdOut };
  });

  if (deletedOrderIdForCreditRelease) {
    releaseReferralCreditReservation(deletedOrderIdForCreditRelease).catch((e) =>
      console.error("[referral-credit] release failed (stale failed order replaced)", {
        orderId: deletedOrderIdForCreditRelease,
        error: e,
      }),
    );
  }

  const rowEscrow = order.paymentMethod === OrderPaymentMethod.escrow;

  if (!rowEscrow) {
    const credit = await applyReferralCreditForBuyNowOrder(order, args.buyerId);
    order.itemPriceUsd = credit.itemPriceUsd;
    order.totalUsd = credit.totalUsd;
  }

  const liveRoomIdForFee = await resolveLiveRoomIdForLiveRoomItem(liveRoomItemId);
  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: order.itemPriceUsd,
    isCompanyListing: Boolean(listing.isCompanyListing),
    liveRoomId: liveRoomIdForFee,
  });

  if (rowEscrow) {
    try {
      const prov = getEscrowProvider();
      const r = await prov.createEscrowTransaction(order.id);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          escrowTransactionId: r.transactionId,
          escrowCheckoutUrl: r.checkoutUrl,
          escrowProvider: prov.name,
          ...(r.trustapBuyerUserId ? { trustapBuyerUserId: r.trustapBuyerUserId } : {}),
        },
      });
      assertValidEscrowTransition(order.escrowStatus, EscrowStatus.pending);
      await logEscrowStatusTransition({
        sellerId: listing.sellerId,
        listingId: listing.id,
        orderId: order.id,
        provider: prov.name,
        escrowTransactionId: r.transactionId,
        previousStatus: order.escrowStatus,
        newStatus: EscrowStatus.pending,
        source: "system",
      });
      const titleShort = listing.title.length > 80 ? `${listing.title.slice(0, 77)}…` : listing.title;
      await createNotification(prisma, {
        userId: args.buyerId,
        type: "order_payment_required",
        title: "Complete secure checkout",
        body: `Vaulted Secure Checkout is ready for “${titleShort}”. Finish payment to confirm your order.`,
        href: `/orders/${encodeURIComponent(order.id)}`,
      });
      return { url: r.checkoutUrl };
    } catch (e) {
      await prisma.order.deleteMany({ where: { id: order.id, paymentStatus: PAYMENT_PENDING } }).catch(() => {});
      await prisma
        .$transaction(async (tx) => {
          await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
            listingId: listing.id,
            userId: args.buyerId,
          });
        })
        .catch(() => {});
      releaseReferralCreditReservation(order.id).catch(() => {});
      throw e;
    }
  }

  if (args.embedded) {
    const charge = await chargeMarketplaceBuyNowOrderWithSavedCard({
      buyerId: args.buyerId,
      orderId: order.id,
      paymentMethodId: args.paymentMethodId,
      liveRoomItemId,
    });
    if (charge.outcome === "paid") {
      return { embedded: true, paid: true, orderId: order.id };
    }
    if (charge.outcome === "requires_action") {
      return {
        embedded: true,
        requiresAction: true,
        orderId: order.id,
        clientSecret: charge.clientSecret,
        paymentIntentId: charge.paymentIntentId,
      };
    }
    if (charge.outcome === "processing") {
      return { embedded: true, processing: true, orderId: order.id };
    }
    throw new Error(charge.code);
  }

  const stripe = getStripe();

  const taxBundle = await buildMarketplaceCheckoutTaxBundle({
    buyerId: args.buyerId,
    shipTo: {
      shipRecipientName: order.shipRecipientName,
      shipAddress: order.shipAddress,
      shipCity: order.shipCity,
      shipState: order.shipState,
      shipZip: order.shipZip,
      shipCountry: order.shipCountry,
    },
    itemPriceUsd: order.itemPriceUsd,
    shippingPriceUsd: order.shippingPriceUsd,
    applicationFeeCents: feeCents,
    sellerShipFrom: await loadSellerShipFromForTax(listing.sellerId),
  });

  const expectedSubtotalCents =
    buyNowCheckoutSubtotalCents(order) + taxBundle.taxAmountCents;
  const reusedUrl = await reuseOpenCheckoutSessionIfMatching({
    sessionId: order.stripeCheckoutSessionId,
    expectedSubtotalCents,
    expectedTaxCents: taxBundle.taxAmountCents,
    collectTax: taxBundle.collectTax,
  });
  if (reusedUrl) return { url: reusedUrl };

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: order.id,
        ...stripeCheckoutSessionPaymentOptions(resolveBuyNowCheckoutLane(liveRoomItemId)),
        ...taxBundle.sessionFields,
        metadata: {
          kind: "buy_now",
          orderId: order.id,
          listingId: listing.id,
          buyerId: args.buyerId,
          liveRoomItemId: liveRoomItemId ?? "",
          ...taxBundle.metadata,
        },
        payment_intent_data: connectCheckoutPaymentIntentData({
          destinationAccountId: listing.seller.stripeAccountId!,
          applicationFeeCents: feeCents,
          sellerTransferCents: taxBundle.sellerTransferCents,
          metadata: { orderId: order.id, kind: "buy_now" },
        }),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(order.itemPriceUsd * 100),
              tax_behavior: "exclusive",
              product_data: stripeLineItemProductData(listing.title, STRIPE_TAX_CODE_TANGIBLE),
            },
          },
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(order.shippingPriceUsd * 100),
              tax_behavior: "exclusive",
              product_data: stripeLineItemProductData(
                liveRoomItemId ? "Live bundled shipping" : "Shipping",
                STRIPE_TAX_CODE_SHIPPING,
              ),
            },
          },
          ...(taxBundle.taxLineItem ? [taxBundle.taxLineItem] : []),
        ],
      },
      {
        idempotencyKey: `buy_now_${order.id}_${Math.round(order.shippingPriceUsd * 100)}_${taxBundle.taxAmountCents}c`,
      },
    );

    if (!session.url) throw new Error("NO_CHECKOUT_URL");

    // From this point on Stripe has committed to a real, payable Checkout Session — the buyer can
    // complete payment on `session.url` regardless of what happens in our own bookkeeping below.
    // Chaos engineering deep-dive (2026-07): this used to be inside the outer try/catch, so a
    // transient failure persisting `stripeCheckoutSessionId` (or sending the notification) fell
    // into the same catch block that deletes the pending order — orphaning an already-payable
    // Stripe session with no local order left for `checkout.session.completed` to finalize into
    // (a buyer could be charged with zero local record). Never delete/roll back the order past this
    // point; best-effort the bookkeeping and let the Stripe<->DB reconciliation cron
    // (`reconcileStripeWithDatabase`) heal it from Stripe's side (keyed off `session.metadata.orderId`,
    // not the local `stripeCheckoutSessionId`) if either write below fails.
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { stripeCheckoutSessionId: session.id },
      });

      const titleShort = listing.title.length > 80 ? `${listing.title.slice(0, 77)}…` : listing.title;
      await createNotification(prisma, {
        userId: args.buyerId,
        type: "order_payment_required",
        title: "Complete your purchase",
        body: `Checkout is ready for “${titleShort}”. Finish payment to confirm your order.`,
        href: `/orders/${encodeURIComponent(order.id)}`,
      });
    } catch (e) {
      console.error(
        "[buy now checkout] post-session bookkeeping failed (session was created; order NOT rolled back)",
        { orderId: order.id, sessionId: session.id, error: e },
      );
    }

    return { url: session.url };
  } catch (e) {
    await prisma.order.deleteMany({ where: { id: order.id, paymentStatus: PAYMENT_PENDING } }).catch(() => {});
    await prisma
      .$transaction(async (tx) => {
        await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
          listingId: listing.id,
          userId: args.buyerId,
        });
      })
      .catch(() => {});
    releaseReferralCreditReservation(order.id).catch(() => {});
    throw e;
  }
}

/** Existing marketplace order awaiting payment (e.g. auction win). */
export async function createPayOrderCheckoutSession(args: {
  buyerId: string;
  orderId: string;
  successPath?: string;
  cancelPath?: string;
}): Promise<{ url: string }> {
  await processAuctionPaymentExpiries();
  const base = siteUrl();

  let order = await prisma.order.findFirst({
    where: {
      id: args.orderId,
      buyerId: args.buyerId,
      paymentStatus: { in: [PAYMENT_PENDING, PAYMENT_FAILED, PAYMENT_REQUIRES_ACTION] },
    },
    include: {
      listing: { select: { id: true, title: true, sellerId: true, isCompanyListing: true } },
      seller: { select: { stripeAccountId: true, stripeOnboardingComplete: true, trustapUserId: true } },
      liveShippingSession: { select: { id: true, shippingCostCents: true, liveShowId: true } },
    },
  });
  if (!order) {
    const expiredOnly = await prisma.order.findFirst({
      where: { id: args.orderId, buyerId: args.buyerId, paymentStatus: PAYMENT_EXPIRED },
      select: { id: true },
    });
    if (expiredOnly) throw new Error("ORDER_PAYMENT_EXPIRED");
    throw new Error("ORDER_NOT_FOUND");
  }
  if (order.paymentStatus === PAYMENT_FAILED || order.paymentStatus === PAYMENT_REQUIRES_ACTION) {
    const listSt = await prisma.listing.findUnique({
      where: { id: order.listingId },
      select: { status: true },
    });
    if (listSt?.status !== "awaiting_auction_payment") throw new Error("ORDER_NOT_FOUND");
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: PAYMENT_PENDING,
        status: "pending",
        stripePaymentIntentId: null,
        stripeCheckoutSessionId: null,
      },
    });
    order = await prisma.order.findFirstOrThrow({
      where: { id: order.id, buyerId: args.buyerId },
      include: {
        listing: { select: { id: true, title: true, sellerId: true, isCompanyListing: true } },
        seller: { select: { stripeAccountId: true, stripeOnboardingComplete: true, trustapUserId: true } },
        liveShippingSession: { select: { id: true, shippingCostCents: true, liveShowId: true } },
      },
    });
  }

  const payOrder = order;
  let shippingPriceUsd = payOrder.shippingPriceUsd;
  if (payOrder.liveShippingSession?.id) {
    const paidOrders = await prisma.order.findMany({
      where: {
        liveShippingSessionId: payOrder.liveShippingSession.id,
        paymentStatus: PAYMENT_PAID,
      },
      select: { id: true, shippingPriceUsd: true },
    });
    const alreadyChargedCents = paidOrders
      .filter((o) => o.id !== payOrder.id)
      .reduce((sum, o) => sum + Math.round(Math.max(0, o.shippingPriceUsd) * 100), 0);
    const remainingCents = Math.max(0, payOrder.liveShippingSession.shippingCostCents - alreadyChargedCents);
    shippingPriceUsd = remainingCents / 100;
  }
  if (Math.abs(shippingPriceUsd - payOrder.shippingPriceUsd) > 0.0001) {
    const refreshed = await prisma.order.update({
      where: { id: payOrder.id },
      data: {
        shippingPriceUsd,
        totalUsd: payOrder.itemPriceUsd + shippingPriceUsd + payOrder.taxUsd,
      },
      include: {
        listing: { select: { id: true, title: true, sellerId: true, isCompanyListing: true } },
        seller: { select: { stripeAccountId: true, stripeOnboardingComplete: true, trustapUserId: true } },
        liveShippingSession: { select: { id: true, shippingCostCents: true, liveShowId: true } },
      },
    });
    order = refreshed;
  }

  const subtotalUsd = order.itemPriceUsd + shippingPriceUsd + order.taxUsd;
  const useEscrow = orderTotalQualifiesForEscrow(subtotalUsd) && isEscrowConfigured();
  if (
    useEscrow &&
    process.env.TRUSTAP_USE_STUB_RESPONSE !== "1" &&
    !order.seller.trustapUserId?.trim()
  ) {
    throw new Error("TRUSTAP_SELLER_NOT_LINKED");
  }
  if (orderTotalQualifiesForEscrow(subtotalUsd) && !isEscrowConfigured()) {
    throw new Error("ESCROW_NOT_CONFIGURED");
  }

  if (useEscrow) {
    if (order.paymentMethod === OrderPaymentMethod.escrow && order.escrowCheckoutUrl) {
      return { url: order.escrowCheckoutUrl };
    }
    const escrowFeeCents = estimateEscrowFeeCents(subtotalUsd);
    assertValidEscrowTransition(order.escrowStatus, EscrowStatus.pending);
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentMethod: OrderPaymentMethod.escrow,
        escrowStatus: EscrowStatus.pending,
        escrowFeeCents,
        stripeCheckoutSessionId: null,
        paymentLabel: "escrow_checkout",
      },
    });
    const prov = getEscrowProvider();
    const r = await prov.createEscrowTransaction(order.id);
    await prisma.order.update({
      where: { id: order.id },
      data: {
        escrowTransactionId: r.transactionId,
        escrowCheckoutUrl: r.checkoutUrl,
        escrowProvider: prov.name,
        ...(r.trustapBuyerUserId ? { trustapBuyerUserId: r.trustapBuyerUserId } : {}),
      },
    });
    await logEscrowStatusTransition({
      sellerId: order.sellerId,
      listingId: order.listingId,
      orderId: order.id,
      provider: prov.name,
      escrowTransactionId: r.transactionId,
      previousStatus: EscrowStatus.pending,
      newStatus: EscrowStatus.pending,
      source: "system",
    });
    return { url: r.checkoutUrl };
  }

  const stripe = getStripe();
  if (!order.seller.stripeAccountId || !order.seller.stripeOnboardingComplete) throw new Error("SELLER_NOT_READY");

  const payOrderCredit = await applyReferralCreditForPayOrder(order, args.buyerId);
  order.itemPriceUsd = payOrderCredit.itemPriceUsd;
  order.totalUsd = payOrderCredit.totalUsd;

  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: order.itemPriceUsd,
    isCompanyListing: Boolean(order.listing.isCompanyListing),
    liveRoomId: order.liveShippingSession?.liveShowId ?? null,
  });

  const taxBundle = await buildMarketplaceCheckoutTaxBundle({
    buyerId: args.buyerId,
    shipTo: {
      shipRecipientName: order.shipRecipientName,
      shipAddress: order.shipAddress,
      shipCity: order.shipCity,
      shipState: order.shipState,
      shipZip: order.shipZip,
      shipCountry: order.shipCountry,
    },
    itemPriceUsd: order.itemPriceUsd,
    shippingPriceUsd,
    applicationFeeCents: feeCents,
    sellerShipFrom: await loadSellerShipFromForTax(order.sellerId),
  });

  const expectedSubtotalCents =
    Math.round(order.itemPriceUsd * 100) + Math.round(shippingPriceUsd * 100) + taxBundle.taxAmountCents;
  const reusedUrl = await reuseOpenCheckoutSessionIfMatching({
    sessionId: order.stripeCheckoutSessionId,
    expectedSubtotalCents,
    expectedTaxCents: taxBundle.taxAmountCents,
    collectTax: taxBundle.collectTax,
  });
  if (reusedUrl) return { url: reusedUrl };

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: `${base}${args.successPath ?? `/orders/${encodeURIComponent(order.id)}`}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${args.cancelPath ?? `/orders/${encodeURIComponent(order.id)}`}`,
      client_reference_id: order.id,
      ...stripeCheckoutSessionPaymentOptions(
        resolveOrderCheckoutLane({ liveShippingSessionId: payOrder.liveShippingSession?.id }),
      ),
      ...taxBundle.sessionFields,
      metadata: {
        kind: "pay_order",
        orderId: order.id,
        listingId: order.listingId,
        buyerId: args.buyerId,
        ...taxBundle.metadata,
      },
      payment_intent_data: connectCheckoutPaymentIntentData({
        destinationAccountId: order.seller.stripeAccountId,
        applicationFeeCents: feeCents,
        sellerTransferCents: taxBundle.sellerTransferCents,
        metadata: { orderId: order.id, kind: "pay_order" },
      }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(order.itemPriceUsd * 100),
            tax_behavior: "exclusive",
            product_data: stripeLineItemProductData(order.listing.title, STRIPE_TAX_CODE_TANGIBLE),
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(shippingPriceUsd * 100),
            tax_behavior: "exclusive",
            product_data: stripeLineItemProductData(
              order.liveShippingSessionId ? "Live bundled shipping" : "Shipping",
              STRIPE_TAX_CODE_SHIPPING,
            ),
          },
        },
        ...(taxBundle.taxLineItem ? [taxBundle.taxLineItem] : []),
      ],
    },
    {
      idempotencyKey: `pay_order_${order.id}_${Math.round(shippingPriceUsd * 100)}_${taxBundle.taxAmountCents}c`,
    },
  );

  if (!session.url) throw new Error("NO_CHECKOUT_URL");

  await prisma.order.update({
    where: { id: order.id },
    data: { stripeCheckoutSessionId: session.id, paymentMethod: OrderPaymentMethod.stripe },
  });

  return { url: session.url };
}

export async function createBreakSpotCheckoutSession(args: {
  userId: string;
  breakSpotId: string;
  successPath?: string;
  cancelPath?: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  const base = siteUrl();

  const spot = await prisma.breakSpot.findFirst({
    where: { id: args.breakSpotId, userId: args.userId },
    include: {
      liveRoom: {
        select: {
          id: true,
          sellerId: true,
          status: true,
        },
      },
    },
  });
  if (!spot || !Number.isFinite(spot.priceUsd) || spot.priceUsd <= 0) throw new Error("SPOT_INVALID");
  if (spot.liveRoom.status !== "live") throw new Error("ROOM_NOT_LIVE");
  if (spot.claimStatus === "paid") throw new Error("ALREADY_PAID");

  const seller = await prisma.user.findUnique({
    where: { id: spot.liveRoom.sellerId },
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });
  if (!seller?.stripeAccountId || !seller.stripeOnboardingComplete) throw new Error("SELLER_NOT_READY");

  const priceUsd = spot.priceUsd;
  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: priceUsd,
    isCompanyListing: false,
    liveRoomId: spot.liveRoomId,
  });

  const taxFields = await buildCheckoutTaxSessionFields({
    buyerId: args.userId,
    collectShippingAddress: true,
  });

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: `${base}${args.successPath ?? `/live/${encodeURIComponent(spot.liveRoomId)}`}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${args.cancelPath ?? `/live/${encodeURIComponent(spot.liveRoomId)}`}`,
      ...stripeCheckoutSessionPaymentOptions("live"),
      ...taxFields,
      metadata: {
        kind: "break_spot",
        breakSpotId: spot.id,
        liveRoomId: spot.liveRoomId,
        userId: args.userId,
      },
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: seller.stripeAccountId },
        metadata: { breakSpotId: spot.id, kind: "break_spot" },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(priceUsd * 100),
            tax_behavior: "exclusive",
            product_data: stripeLineItemProductData(`Break spot: ${spot.spotLabel}`, STRIPE_TAX_CODE_TANGIBLE),
          },
        },
      ],
    },
    { idempotencyKey: `break_spot_${spot.id}` },
  );

  if (!session.url) throw new Error("NO_CHECKOUT_URL");

  await prisma.breakSpot.update({
    where: { id: spot.id },
    data: {
      stripeCheckoutSessionId: session.id,
      breakPaymentStatus: "pending_payment",
    },
  });

  return { url: session.url };
}

async function markBuyNowLiveRoomItemSold(args: {
  liveRoomItemId: string | null | undefined;
  listingId: string | null | undefined;
}): Promise<void> {
  const liveRoomItemId = args.liveRoomItemId?.trim();
  if (!liveRoomItemId) return;

  const item = await prisma.liveRoomItem.findFirst({
    where: { id: liveRoomItemId, listingId: args.listingId ?? undefined },
    select: { id: true, liveRoomId: true, status: true },
  });
  if (!item || item.status === "sold") return;

  const changed = await prisma.liveRoomItem.updateMany({
    where: { id: item.id, status: { not: "sold" } },
    data: { status: "sold", itemVersion: { increment: 1 } },
  });
  if (changed.count === 0) return;

  const itemNext = await prisma.liveRoomItem.findUnique({
    where: { id: item.id },
    select: { id: true, itemVersion: true, liveRoomId: true },
  });
  if (!itemNext) return;

  const roomNext = await prisma.liveRoom.update({
    where: { id: item.liveRoomId },
    data: { roomVersion: { increment: 1 } },
    select: { roomVersion: true },
  });
  emitLiveRoomMessagesRefetch(item.liveRoomId);
  emitPurchaseCompleted(item.liveRoomId, itemNext.id, {
    roomVersion: roomNext.roomVersion,
    itemVersion: itemNext.itemVersion,
  });
}

/**
 * Finalize a paid Stripe Checkout session when the buyer returns from Checkout or when
 * reconciling a pending order (webhook fallback).
 */
export async function confirmMarketplaceCheckoutSessionFromRedirect(
  sessionId: string,
  userId: string,
): Promise<{ orderId: string; finalized: boolean }> {
  const trimmedSessionId = sessionId.trim();
  if (!trimmedSessionId) throw new Error("SESSION_ID_REQUIRED");

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(trimmedSessionId);
  if (session.payment_status !== "paid") throw new Error("CHECKOUT_NOT_PAID");

  const kind = session.metadata?.kind ?? "";
  if (kind !== "buy_now" && kind !== "pay_order") throw new Error("UNSUPPORTED_CHECKOUT_KIND");

  const orderId = session.metadata?.orderId?.trim();
  if (!orderId) throw new Error("ORDER_NOT_FOUND");

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { buyerId: true, paymentMethod: true, paymentStatus: true },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.buyerId !== userId) throw new Error("FORBIDDEN");
  if (order.paymentMethod === OrderPaymentMethod.escrow) throw new Error("UNSUPPORTED_CHECKOUT_KIND");

  const alreadyPaid = order.paymentStatus === PAYMENT_PAID;
  if (!alreadyPaid) {
    const pi =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    await finalizeStripeMarketplaceOrderPaid(orderId, pi, session.id);
    if (kind === "buy_now") {
      await markBuyNowLiveRoomItemSold({
        liveRoomItemId: session.metadata?.liveRoomItemId,
        listingId: session.metadata?.listingId,
      });
    }
  }

  return { orderId, finalized: !alreadyPaid };
}

/** Repair one pending order when its Checkout Session is already paid. */
export async function reconcileOrderCheckoutSession(orderId: string, userId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      buyerId: true,
      paymentStatus: true,
      paymentMethod: true,
      stripeCheckoutSessionId: true,
    },
  });
  if (!order || order.buyerId !== userId) return false;
  if (order.paymentStatus !== PAYMENT_PENDING || order.paymentMethod !== OrderPaymentMethod.stripe) {
    return false;
  }
  const sessionId = order.stripeCheckoutSessionId?.trim();
  if (!sessionId) return false;
  try {
    const result = await confirmMarketplaceCheckoutSessionFromRedirect(sessionId, userId);
    return result.finalized;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== "CHECKOUT_NOT_PAID" && msg !== "UNSUPPORTED_CHECKOUT_KIND") {
      console.warn("[checkout] reconcile order session", { orderId, userId, error: msg });
    }
    return false;
  }
}

/** Repair pending Stripe checkout orders whose Checkout Session is already paid. */
export async function reconcileBuyerPendingCheckoutSessions(userId: string): Promise<number> {
  const pending = await prisma.order.findMany({
    where: {
      buyerId: userId,
      paymentStatus: PAYMENT_PENDING,
      paymentMethod: OrderPaymentMethod.stripe,
      stripeCheckoutSessionId: { not: null },
    },
    select: { stripeCheckoutSessionId: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  let finalized = 0;
  for (const row of pending) {
    const sessionId = row.stripeCheckoutSessionId?.trim();
    if (!sessionId) continue;
    try {
      const result = await confirmMarketplaceCheckoutSessionFromRedirect(sessionId, userId);
      if (result.finalized) finalized += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "CHECKOUT_NOT_PAID" || msg === "UNSUPPORTED_CHECKOUT_KIND") continue;
      console.warn("[checkout] reconcile pending session", { sessionId, userId, error: msg });
    }
  }
  return finalized;
}

let lastGlobalCheckoutReconcileMs = 0;
const GLOBAL_CHECKOUT_RECONCILE_MIN_INTERVAL_MS = 30_000;

/** Repair marketplace orders stuck in pending_payment after Stripe Checkout already paid. */
export async function reconcileStalePendingCheckoutSessionsGlobal(limit = 25): Promise<number> {
  const nowMs = Date.now();
  if (nowMs - lastGlobalCheckoutReconcileMs < GLOBAL_CHECKOUT_RECONCILE_MIN_INTERVAL_MS) return 0;
  lastGlobalCheckoutReconcileMs = nowMs;

  if (!isStripeConfigured()) return 0;

  const pending = await prisma.order.findMany({
    where: {
      paymentStatus: PAYMENT_PENDING,
      paymentMethod: OrderPaymentMethod.stripe,
      stripeCheckoutSessionId: { not: null },
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    select: { buyerId: true, stripeCheckoutSessionId: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  let finalized = 0;
  for (const row of pending) {
    const sessionId = row.stripeCheckoutSessionId?.trim();
    if (!sessionId) continue;
    try {
      const result = await confirmMarketplaceCheckoutSessionFromRedirect(sessionId, row.buyerId);
      if (result.finalized) finalized += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "CHECKOUT_NOT_PAID" || msg === "UNSUPPORTED_CHECKOUT_KIND") continue;
      console.warn("[checkout] global reconcile pending session", { sessionId, error: msg });
    }
  }
  return finalized;
}

export async function finalizeStripeMarketplaceOrderPaid(
  orderId: string,
  paymentIntentId: string | null,
  sessionId: string | null,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      listingId: true,
      buyerId: true,
      sellerId: true,
      paymentStatus: true,
      paymentMethod: true,
      shippingPriceUsd: true,
      itemPriceUsd: true,
      taxUsd: true,
      taxAmountCents: true,
      stripeTaxCalculationId: true,
      shipState: true,
      shipCountry: true,
      liveShippingSession: { select: { liveShowId: true } },
      listing: { select: { title: true, buyingFormat: true } },
    },
  });
  if (!order || order.paymentStatus === PAYMENT_PAID || order.paymentStatus === PAYMENT_EXPIRED) return;
  if (order.paymentMethod === OrderPaymentMethod.escrow) return;

  // Both reads are independent Stripe lookups keyed only on `sessionId` — run them in
  // parallel instead of sequentially (performance audit 2026-07).
  const [taxFromSession, breakdown] =
    sessionId != null
      ? await Promise.all([fetchCheckoutSessionTax(sessionId), fetchCheckoutSessionChargeBreakdown(sessionId)])
      : [null, null];
  let taxAmountCents = breakdown
    ? Math.round(breakdown.taxUsd * 100)
    : taxFromSession?.taxAmountCents ?? 0;
  let stripeTaxCalculationId = taxFromSession?.stripeTaxCalculationId ?? null;

  if (taxAmountCents <= 0 && paymentIntentId) {
    const taxFromPi = await fetchPaymentIntentTax(paymentIntentId);
    if (taxFromPi && taxFromPi.taxAmountCents > 0) {
      taxAmountCents = taxFromPi.taxAmountCents;
      stripeTaxCalculationId = taxFromPi.stripeTaxCalculationId ?? stripeTaxCalculationId;
    }
  }

  if (taxAmountCents <= 0 && (order.taxAmountCents ?? 0) > 0) {
    taxAmountCents = order.taxAmountCents;
    stripeTaxCalculationId = order.stripeTaxCalculationId ?? stripeTaxCalculationId;
  } else if (taxAmountCents <= 0 && (order.taxUsd ?? 0) > 0) {
    taxAmountCents = Math.round(order.taxUsd * 100);
  }

  const taxUsd = breakdown?.taxUsd ?? taxAmountCents / 100;
  const itemPriceUsd = breakdown?.itemPriceUsd ?? order.itemPriceUsd;
  const shippingPriceUsd = breakdown?.shippingPriceUsd ?? order.shippingPriceUsd;
  const totalUsd = breakdown?.totalUsd ?? itemPriceUsd + shippingPriceUsd + taxUsd;

  const shippingChargedCents = Math.round(Math.max(0, shippingPriceUsd) * 100);

  const taxFields = buildOrderTaxPersistFields({
    itemPriceUsd,
    shippingPriceUsd,
    taxAmountCents,
    stripeTaxCalculationId,
    taxJurisdictionState: order.shipState,
  });

  const result = await prisma.$transaction(async (tx) => {
    // Compare-and-swap: this function is invoked from multiple independent triggers for the same
    // order — the Stripe webhook (`checkout.session.completed` / `payment_intent.succeeded`) and a
    // client-initiated "confirm checkout" fallback (`confirmMarketplaceCheckoutSession`) can both
    // race in after reading `paymentStatus` as not-yet-paid. Without claiming the row here, both
    // callers would run the full finalize flow — duplicate buyer/seller notifications, duplicate
    // payout initialization, and double-counted live-show GMV. Only the caller that wins the claim
    // proceeds; the loser returns early and skips every side effect below.
    const claim = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: { notIn: [PAYMENT_PAID, PAYMENT_EXPIRED] } },
      data: {
        paymentStatus: PAYMENT_PAID,
        status: "paid",
        stripePaymentIntentId: paymentIntentId ?? undefined,
        stripeCheckoutSessionId: sessionId ?? undefined,
        shippingChargedCents,
        ...taxFields,
        itemPriceUsd,
        shippingPriceUsd,
      },
    });
    if (claim.count === 0) return { claimed: false as const, closedLayaways: [] };

    await tx.listing.updateMany({
      where: {
        id: order.listingId,
        status: { in: ["active", "auction_live", "awaiting_auction_payment", "layaway_reserved"] },
        moderationRemovedAt: null,
      },
      data: { status: "sold" },
    });

    const { closeActiveLayawaysSupersededByMarketplacePurchaseTx } = await import("@/services/layaway");
    const closedLayaways = await closeActiveLayawaysSupersededByMarketplacePurchaseTx(tx, {
      listingId: order.listingId,
      winningOrderId: orderId,
      winningBuyerId: order.buyerId,
    });

    await consumeListingInventoryHoldTx(tx, {
      listingId: order.listingId,
      userId: order.buyerId,
      orderId,
    });

    const liveRoomId = order.liveShippingSession?.liveShowId ?? null;
    if (liveRoomId) {
      await recordLiveShowCompletedSaleTx(tx, liveRoomId, order.itemPriceUsd);
    }

    return { claimed: true as const, closedLayaways };
  });

  if (!result.claimed) return;
  const { closedLayaways } = result;

  // Referral program: best-effort, never throws — see `web/src/lib/referral-credit.ts` for the
  // full first-qualifying-order / self-referral / hold-window rules.
  void grantReferralCreditsForQualifyingOrder(orderId);

  // Spend side of the referral credit program: permanently commit any credit reserved for this
  // order at checkout time (a no-op if none was reserved). Best-effort — never blocks finalize.
  void commitReferralCreditReservation(orderId, orderId).catch((e) =>
    console.error("[referral-credit] commit failed", { orderId, error: e }),
  );

  void recordTaxDestinationVolumeOnOrderPaid({
    shipState: order.shipState,
    shipCountry: order.shipCountry,
    itemPriceUsd,
    shippingPriceUsd,
    taxAmountCents,
  }).catch((e) => console.warn("[sales-tax] nexus volume record failed", e));

  void recordStripeTaxTransaction({
    taxCalculationId: taxFields.stripeTaxCalculationId,
    reference: orderId,
  });

  void initializeOrderPayoutOnPayment(orderId);

  const lt = order.listing.title.length > 90 ? `${order.listing.title.slice(0, 87)}…` : order.listing.title;
  await createNotification(prisma, {
    userId: order.sellerId,
    type: "seller_ready_to_ship",
    title: "Payment received — ready to ship",
    body: `“${lt}” is paid. Create a shipping label from Sales or mark shipped when you send.`,
    href: `/orders/${encodeURIComponent(orderId)}`,
  });
  await createNotification(prisma, {
    userId: order.buyerId,
    type: "purchase_complete",
    title: "Payment confirmed",
    body: `Your order for “${lt}” is paid.`,
    href: `/orders/${encodeURIComponent(orderId)}`,
  });
  scheduleOrderLifecycleEmail({
    userId: order.sellerId,
    kind: "seller_ready_to_ship",
    orderId,
    listingTitle: order.listing.title,
  });
  scheduleOrderLifecycleEmail({
    userId: order.buyerId,
    kind: "purchase_complete",
    orderId,
    listingTitle: order.listing.title,
    totalUsd,
  });

  emitOrderLifecycleSync({
    orderId,
    parties: { sellerId: order.sellerId, buyerId: order.buyerId },
    listingId: order.listingId,
    orderStatus: "paid",
    paymentStatus: PAYMENT_PAID,
    listingStatus: "sold",
  });

  for (const lay of closedLayaways) {
    const { emitLayawayLifecycleSync } = await import("@/lib/marketplace/ecosystem-sync");
    const sameOrder = lay.orderId === orderId;
    emitLayawayLifecycleSync({
      typedEvent: sameOrder ? "layaway_paid_in_full" : "layaway_canceled",
      layawayId: lay.id,
      parties: { sellerId: lay.sellerId, buyerId: lay.buyerId },
      listingId: lay.listingId,
      orderId: lay.orderId,
      layawayStatus: sameOrder ? "completed" : "canceled",
      listingStatus: "sold",
      orderStatus: "paid",
      paymentStatus: PAYMENT_PAID,
      extraPayload: { supersededByOrderId: orderId },
    });
    if (!sameOrder) {
      const { refundSupersededLayawayPayments } = await import("@/services/layaway");
      await refundSupersededLayawayPayments(lay.id).catch((e) =>
        console.error("[payments] superseded layaway refund failed", lay.id, e),
      );
    }
  }
}

export async function processStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  const stripe = getStripe();
  /** Stripe API typings may lag newly shipped event names; treat type as runtime string. */
  const type = event.type as string;

  switch (type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const kind = session.metadata?.kind;
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

      if (kind === "live_tip") {
        const liveTipId = session.metadata?.liveTipId;
        if (!liveTipId) return;
        await finalizeLiveTipPaid({
          liveTipId,
          paymentIntentId: pi,
          checkoutSessionId: session.id,
        });
        const tip = await prisma.liveTip.findUnique({
          where: { id: liveTipId },
          select: { liveRoomId: true, recipientId: true, amountUsd: true, sender: { select: { username: true } } },
        });
        if (tip) {
          emitLiveRoomMessagesRefetch(tip.liveRoomId);
          await createNotification(prisma, {
            userId: tip.recipientId,
            type: "live_tip_received",
            title: "Tip received",
            body: `@${tip.sender.username} sent you a $${tip.amountUsd.toFixed(2)} tip during the live show.`,
            href: `/live/${encodeURIComponent(tip.liveRoomId)}`,
          });
        }
        return;
      }

      if (kind === "layaway_deposit") {
        const layawayId = session.metadata?.layawayId;
        const orderId = session.metadata?.orderId;
        if (!layawayId || !orderId) return;
        const { finalizeLayawayDepositPaid } = await import("@/services/layaway");
        await finalizeLayawayDepositPaid({
          layawayId,
          orderId,
          paymentIntentId: pi,
          checkoutSessionId: session.id,
        });
        return;
      }

      if (kind === "layaway_payment") {
        const layawayId = session.metadata?.layawayId;
        const layawayPaymentId = session.metadata?.layawayPaymentId;
        const orderId = session.metadata?.orderId;
        if (!layawayId || !layawayPaymentId || !orderId) return;
        const { finalizeLayawayInstallmentPaid } = await import("@/services/layaway");
        await finalizeLayawayInstallmentPaid({
          layawayId,
          layawayPaymentId,
          orderId,
          paymentIntentId: pi,
          checkoutSessionId: session.id,
        });
        return;
      }

      if (kind === "buy_now" || kind === "pay_order") {
        const orderId = session.metadata?.orderId;
        if (!orderId) return;
        const ord = await prisma.order.findUnique({
          where: { id: orderId },
          select: { paymentMethod: true },
        });
        if (ord?.paymentMethod === OrderPaymentMethod.escrow) return;
        await finalizeStripeMarketplaceOrderPaid(orderId, pi, session.id);

        if (kind === "buy_now") {
          await markBuyNowLiveRoomItemSold({
            liveRoomItemId: session.metadata?.liveRoomItemId,
            listingId: session.metadata?.listingId,
          });
        }
        return;
      }

      if (kind === "break_spot") {
        const breakSpotId = session.metadata?.breakSpotId;
        if (!breakSpotId) return;
        const { finalizeBreakSpotPaid } = await import("@/lib/live-buy-now-purchase");
        await finalizeBreakSpotPaid({ breakSpotId, paymentIntentId: pi ?? undefined });
        return;
      }

      if (kind === "variant_purchase") {
        const purchaseId = session.metadata?.purchaseId;
        if (!purchaseId) return;
        const { finalizeLiveItemVariantPurchasePaid } = await import("@/lib/live-item-variant-purchase");
        await finalizeLiveItemVariantPurchasePaid(purchaseId, pi ?? undefined);
        return;
      }
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      const kind = session.metadata?.kind;
      if (kind === "layaway_deposit") {
        const layawayId = session.metadata?.layawayId?.trim() || null;
        const layawayOrderId = session.metadata?.orderId?.trim() || null;
        const { cancelAbandonedLayawayCheckout } = await import("@/services/layaway");
        await cancelAbandonedLayawayCheckout({ layawayId, orderId: layawayOrderId }).catch((e) => {
          console.error("[stripe webhook] cancelAbandonedLayawayCheckout", e);
        });
        break;
      }
      if (orderId && kind !== "break_spot") {
        if (kind === "buy_now") {
          const liveRoomItemId = session.metadata?.liveRoomItemId?.trim() || null;
          const buyerId = session.metadata?.buyerId?.trim() || null;
          if (liveRoomItemId && buyerId && orderId) {
            const order = await prisma.order.findUnique({
              where: { id: orderId },
              select: {
                id: true,
                buyerId: true,
                itemPriceUsd: true,
                paymentStatus: true,
                listing: { select: { title: true } },
              },
            });
            const item = await prisma.liveRoomItem.findUnique({
              where: { id: liveRoomItemId },
              select: { liveRoomId: true, title: true },
            });
            if (order && item && order.paymentStatus === PAYMENT_PENDING) {
              await releaseActiveInventoryHoldsForOrderId(orderId).catch(() => {});
              await releaseActiveInventoryHoldFromBuyNowStripeMetadata(session.metadata ?? {});
              await prisma.order.updateMany({
                where: { id: orderId, paymentStatus: PAYMENT_PENDING },
                data: { paymentStatus: PAYMENT_FAILED, status: "cancelled" },
              });
              releaseReferralCreditReservation(orderId).catch(() => {});
              await ensureLiveRoomPaymentFailureRecorded({
                liveRoomId: item.liveRoomId,
                buyerId: order.buyerId,
                kind: "buy_now",
                orderId: order.id,
                liveRoomItemId,
                amountUsd: order.itemPriceUsd,
                itemTitle: item.title || order.listing.title,
                failureReason: "Checkout expired before payment completed.",
              });
            } else {
              await releaseActiveInventoryHoldsForOrderId(orderId).catch(() => {});
              await releaseActiveInventoryHoldFromBuyNowStripeMetadata(session.metadata ?? {});
              await prisma.order.deleteMany({
                where: {
                  id: orderId,
                  paymentStatus: PAYMENT_PENDING,
                  paymentMethod: { not: OrderPaymentMethod.escrow },
                },
              });
              releaseReferralCreditReservation(orderId).catch(() => {});
            }
          } else {
            await releaseActiveInventoryHoldsForOrderId(orderId).catch(() => {});
            await releaseActiveInventoryHoldFromBuyNowStripeMetadata(session.metadata ?? {});
            await prisma.order.deleteMany({
              where: {
                id: orderId,
                paymentStatus: PAYMENT_PENDING,
                paymentMethod: { not: OrderPaymentMethod.escrow },
              },
            });
            releaseReferralCreditReservation(orderId).catch(() => {});
          }
        } else {
          await releaseActiveInventoryHoldsForOrderId(orderId).catch(() => {});
          await prisma.order.updateMany({
            where: {
              id: orderId,
              paymentStatus: PAYMENT_PENDING,
              paymentMethod: { not: OrderPaymentMethod.escrow },
            },
            data: { paymentStatus: PAYMENT_FAILED, status: "cancelled" },
          });
          releaseReferralCreditReservation(orderId).catch(() => {});
        }
      }
      if (session.metadata?.kind === "break_spot" && session.metadata.breakSpotId) {
        const breakSpotId = session.metadata.breakSpotId;
        await prisma.breakSpot.updateMany({
          where: { id: breakSpotId, breakPaymentStatus: "pending_payment" },
          data: { breakPaymentStatus: "failed", stripeCheckoutSessionId: null },
        });
        const spot = await prisma.breakSpot.findUnique({
          where: { id: breakSpotId },
          select: {
            id: true,
            liveRoomId: true,
            userId: true,
            spotLabel: true,
            priceUsd: true,
            liveRoomItemId: true,
          },
        });
        if (spot) {
          await ensureLiveRoomPaymentFailureRecorded({
            liveRoomId: spot.liveRoomId,
            buyerId: spot.userId,
            kind: "break_spot",
            breakSpotId: spot.id,
            liveRoomItemId: spot.liveRoomItemId,
            amountUsd: spot.priceUsd,
            itemTitle: spot.spotLabel,
            failureReason: "Checkout expired before payment completed.",
          });
        }
      }
      if (session.metadata?.kind === "variant_purchase" && session.metadata.purchaseId) {
        const { releaseVariantPurchaseOnCheckoutExpired } = await import("@/lib/live-item-variant-purchase");
        await releaseVariantPurchaseOnCheckoutExpired(session.metadata.purchaseId);
      }
      if (session.metadata?.kind === "live_tip" && session.metadata.liveTipId) {
        await markLiveTipCheckoutFailed(session.metadata.liveTipId);
      }
      break;
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.orderId?.trim() || null;
      const kind = pi.metadata?.kind ?? null;

      if (kind === "variant_purchase_saved_pm") {
        const purchaseId = pi.metadata?.purchaseId?.trim() || null;
        if (purchaseId) {
          const { finalizeLiveItemVariantPurchasePaid } = await import("@/lib/live-item-variant-purchase");
          const { emitLiveRoomQueueItemsChanged } = await import("@/lib/realtime-emit-server");
          await finalizeLiveItemVariantPurchasePaid(purchaseId, pi.id);
          const purchase = await prisma.liveItemVariantPurchase.findUnique({
            where: { id: purchaseId },
            select: { liveRoomId: true },
          });
          if (purchase) emitLiveRoomQueueItemsChanged(purchase.liveRoomId);
        }
        break;
      }

      if (kind === "break_spot_saved_pm") {
        const breakSpotId = pi.metadata?.breakSpotId?.trim() || null;
        if (breakSpotId) {
          const { finalizeBreakSpotPaid } = await import("@/lib/live-buy-now-purchase");
          await finalizeBreakSpotPaid({ breakSpotId, paymentIntentId: pi.id });
        }
        break;
      }

      if (kind === LIVE_BUY_NOW_PI_KIND) {
        const orderId = pi.metadata?.orderId?.trim() || null;
        const liveRoomId = pi.metadata?.liveRoomId?.trim() || null;
        const liveRoomItemId = pi.metadata?.liveRoomItemId?.trim() || null;
        if (orderId && liveRoomId && liveRoomItemId) {
          const { finalizeLiveBuyNowPurchaseComplete } = await import("@/lib/live-buy-now-purchase");
          await finalizeLiveBuyNowPurchaseComplete({
            orderId,
            liveRoomId,
            liveRoomItemId,
            paymentIntentId: pi.id,
          });
        }
        break;
      }

      if (!orderId) break;
      if (kind === "break_spot" || kind === "live_tip") break;

      if (!isMarketplaceOrderPaymentIntentKind(kind)) {
        logIgnoredMarketplacePaymentIntentWebhook(
          "payment_intent.succeeded",
          !kind?.trim() ? "missing_metadata_kind" : "unexpected_metadata_kind",
          { paymentIntentId: pi.id, kind, orderId },
        );
        break;
      }

      const gate = await assertMarketplaceOrderPaymentIntentMatchesOrder(pi, orderId);
      if (!gate.ok) {
        logIgnoredMarketplacePaymentIntentWebhook("payment_intent.succeeded", gate.reason, {
          paymentIntentId: pi.id,
          kind,
          orderId,
        });
        break;
      }

      await finalizeStripeMarketplaceOrderPaid(orderId, pi.id, null);
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.orderId?.trim() || null;
      const kind = pi.metadata?.kind ?? null;

      if (kind === "variant_purchase_saved_pm") {
        const purchaseId = pi.metadata?.purchaseId?.trim() || null;
        if (purchaseId) {
          const purchase = await prisma.liveItemVariantPurchase.findUnique({
            where: { id: purchaseId },
            select: {
              liveRoomId: true,
              liveRoomItemId: true,
              buyerId: true,
              totalUsd: true,
              variant: { select: { label: true } },
            },
          });
          const { releaseVariantPurchaseOnCheckoutExpired } = await import("@/lib/live-item-variant-purchase");
          await releaseVariantPurchaseOnCheckoutExpired(purchaseId);
          if (purchase) {
            await ensureLiveRoomPaymentFailureRecorded({
              liveRoomId: purchase.liveRoomId,
              buyerId: purchase.buyerId,
              kind: "variant_purchase",
              variantPurchaseId: purchaseId,
              liveRoomItemId: purchase.liveRoomItemId,
              amountUsd: purchase.totalUsd,
              itemTitle: purchase.variant.label,
              failureReason: pi.last_payment_error?.message ?? "Your card was declined.",
            });
          }
        }
        break;
      }

      if (kind === LIVE_BUY_NOW_PI_KIND) {
        const orderId = pi.metadata?.orderId?.trim() || null;
        const liveRoomId = pi.metadata?.liveRoomId?.trim() || null;
        const liveRoomItemId = pi.metadata?.liveRoomItemId?.trim() || null;
        const buyerId = pi.metadata?.userId?.trim() || null;
        if (orderId && liveRoomId && liveRoomItemId && buyerId) {
          const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { itemPriceUsd: true, listing: { select: { title: true } } },
          });
          await prisma.order.updateMany({
            where: { id: orderId, paymentStatus: { not: PAYMENT_PAID } },
            data: { paymentStatus: PAYMENT_FAILED, status: "cancelled" },
          });
          await ensureLiveRoomPaymentFailureRecorded({
            liveRoomId,
            buyerId,
            kind: "buy_now",
            orderId,
            liveRoomItemId,
            amountUsd: order?.itemPriceUsd ?? pi.amount / 100,
            itemTitle: order?.listing.title ?? null,
            failureReason: pi.last_payment_error?.message ?? "Your card was declined.",
          });
        }
        break;
      }

      if (kind === "break_spot_saved_pm" || pi.metadata?.breakSpotId) {
        const breakSpotId = pi.metadata?.breakSpotId?.trim() || null;
        if (breakSpotId) {
          await prisma.breakSpot.updateMany({
            where: { id: breakSpotId },
            data: { breakPaymentStatus: "failed" },
          });
          const spot = await prisma.breakSpot.findUnique({
            where: { id: breakSpotId },
            select: {
              liveRoomId: true,
              userId: true,
              spotLabel: true,
              priceUsd: true,
              liveRoomItemId: true,
            },
          });
          if (spot) {
            await ensureLiveRoomPaymentFailureRecorded({
              liveRoomId: spot.liveRoomId,
              buyerId: spot.userId,
              kind: "break_spot",
              breakSpotId,
              liveRoomItemId: spot.liveRoomItemId,
              amountUsd: spot.priceUsd,
              itemTitle: spot.spotLabel,
              failureReason: pi.last_payment_error?.message ?? "Your card was declined.",
            });
          }
        }
        break;
      }

      if (orderId && kind !== "break_spot") {
        if (!isMarketplaceOrderPaymentIntentKind(kind)) {
          logIgnoredMarketplacePaymentIntentWebhook(
            "payment_intent.payment_failed",
            !kind?.trim() ? "missing_metadata_kind" : "unexpected_metadata_kind",
            { paymentIntentId: pi.id, kind, orderId },
          );
        } else {
          const gate = await assertMarketplaceOrderPaymentIntentMatchesOrder(pi, orderId);
          if (!gate.ok) {
            logIgnoredMarketplacePaymentIntentWebhook("payment_intent.payment_failed", gate.reason, {
              paymentIntentId: pi.id,
              kind,
              orderId,
            });
          } else if (kind === "buy_now") {
            const liveRoomItemId = pi.metadata?.liveRoomItemId?.trim() || null;
            const liveRoomId = pi.metadata?.liveRoomId?.trim() || null;
            await releaseActiveInventoryHoldsForOrderId(orderId).catch(() => {});
            await prisma.order.updateMany({
              where: {
                id: orderId,
                paymentStatus: PAYMENT_PENDING,
                paymentMethod: { not: OrderPaymentMethod.escrow },
              },
              data: { paymentStatus: PAYMENT_FAILED, status: "cancelled" },
            });
            if (liveRoomItemId && liveRoomId) {
              const order = await prisma.order.findUnique({
                where: { id: orderId },
                select: { buyerId: true, itemPriceUsd: true, listing: { select: { title: true } } },
              });
              if (order) {
                await ensureLiveRoomPaymentFailureRecorded({
                  liveRoomId,
                  buyerId: order.buyerId,
                  kind: "buy_now",
                  orderId,
                  liveRoomItemId,
                  amountUsd: order.itemPriceUsd,
                  itemTitle: order.listing.title,
                  failureReason: pi.last_payment_error?.message ?? "Your card was declined.",
                });
              }
            }
          } else {
            await releaseActiveInventoryHoldsForOrderId(orderId).catch(() => {});
            await prisma.order.updateMany({
              where: {
                id: orderId,
                paymentStatus: { in: [PAYMENT_PENDING, PAYMENT_REQUIRES_ACTION] },
                paymentMethod: { not: OrderPaymentMethod.escrow },
              },
              data: { paymentStatus: PAYMENT_FAILED, status: "cancelled" },
            });
          }
        }
      }
      if (pi.metadata?.breakSpotId && kind !== "break_spot_saved_pm") {
        const breakSpotId = pi.metadata.breakSpotId;
        await prisma.breakSpot.updateMany({
          where: { id: breakSpotId },
          data: { breakPaymentStatus: "failed" },
        });
        const spot = await prisma.breakSpot.findUnique({
          where: { id: breakSpotId },
          select: {
            liveRoomId: true,
            userId: true,
            spotLabel: true,
            priceUsd: true,
            liveRoomItemId: true,
          },
        });
        if (spot) {
          await ensureLiveRoomPaymentFailureRecorded({
            liveRoomId: spot.liveRoomId,
            buyerId: spot.userId,
            kind: "break_spot",
            breakSpotId,
            liveRoomItemId: spot.liveRoomItemId,
            amountUsd: spot.priceUsd,
            itemTitle: spot.spotLabel,
            failureReason: pi.last_payment_error?.message ?? "Your card was declined.",
          });
        }
      }
      break;
    }
    case "charge.refunded": {
      const ch = event.data.object as Stripe.Charge;
      const piId = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
      if (!piId) break;
      // `ch.refunded` is only true once the *cumulative* refunded amount equals the full charge.
      // Partial refunds (e.g. a support agent issuing a small goodwill refund directly in the
      // Stripe Dashboard) also emit this event but must NOT cancel/refund-flag an order that is
      // otherwise still fulfilling — there is no partial-refund order state in this app today.
      // Partial refunds are an explicitly UNSUPPORTED flow: no in-app UI/API lets a buyer, seller,
      // or admin *initiate* one (`executeOrderRefund` always refunds the full order amount, and
      // now rejects layaway orders outright — see its guard). The only way a partial refund can
      // happen is a human acting directly in the Stripe Dashboard, outside this app's bookkeeping.
      // When that happens, the actual dollars available to eventually pay the seller are now less
      // than `itemPriceUsd + shippingPriceUsd - fee` implies, so flag for manual review rather than
      // silently letting payout continue as if nothing happened.
      if (!ch.refunded) {
        console.warn("[stripe charge.refunded] partial refund received, order flagged for manual review", {
          chargeId: ch.id,
          paymentIntent: piId,
          amountRefunded: ch.amount_refunded,
          amount: ch.amount,
        });
        const partiallyRefundedOrders = await prisma.order.findMany({
          where: { stripePaymentIntentId: piId },
          select: {
            id: true,
            sellerId: true,
            payoutStatus: true,
            paymentMethod: true,
            listing: { select: { title: true } },
            layaway: { select: { status: true } },
          },
        });
        for (const o of partiallyRefundedOrders) {
          // Layaway deposits deliberately collect tax as a line item alongside the (partially
          // forfeitable) deposit — `defaultLayawayPlan` refunds *only* the tax portion of that
          // same charge on default, which Stripe reports as a partial refund of the deposit
          // charge even though it is fully understood/expected bookkeeping, not a surprise. Once
          // the layaway service has already moved the plan out of `active` (defaulted/refunded/
          // completed), this app already knows exactly why the charge was partially refunded, so
          // skip the manual-review noise. A partial refund on a *still-active* layaway (e.g. an
          // admin manually refunding tax early, or an unrelated Dashboard action) is still
          // genuinely unexpected and should be flagged.
          if (
            o.paymentMethod === OrderPaymentMethod.layaway &&
            o.layaway &&
            o.layaway.status !== LayawayStatus.active
          ) {
            continue;
          }
          const claim = await prisma.order.updateMany({
            where: { id: o.id, payoutStatus: { not: "manual_review" } },
            data: { payoutStatus: "manual_review", payoutBlockedReason: "partial_refund_needs_review" },
          });
          if (claim.count === 0) continue;
          const title = o.listing?.title ?? "an order";
          await logSellerCommerceEvent({
            sellerId: o.sellerId,
            orderId: o.id,
            kind: "order_partial_refund_needs_review",
            title: "Partial refund detected",
            body: `A partial refund ($${(Math.max(0, ch.amount_refunded) / 100).toFixed(2)} of $${(Math.max(0, ch.amount) / 100).toFixed(2)}) was issued for “${title}” outside the normal refund flow. Payout is on hold for manual review.`,
          });
        }
        break;
      }
      const orders = await prisma.order.findMany({
        where: { stripePaymentIntentId: piId },
        select: {
          id: true,
          buyerId: true,
          sellerId: true,
          listingId: true,
          paymentStatus: true,
          payoutStatus: true,
          taxAmountCents: true,
          itemPriceUsd: true,
          listing: { select: { title: true } },
          liveShippingSession: { select: { liveShowId: true } },
        },
      });
      for (const o of orders) {
        // Idempotent no-op if this order's refund was already fully processed — either by the
        // in-app admin-approved refund flow (`executeOrderRefund`, which issues the Stripe refund
        // and applies these same effects inside its own transaction) or a prior delivery of this
        // same webhook. Without this guard, this branch is also the *safety net* for refunds
        // issued directly against Stripe (outside this app's refund-request flow), which
        // otherwise leave `payoutStatus` unblocked — a seller could still be paid out on an
        // order whose funds were already returned to the buyer.
        if (o.paymentStatus === PAYMENT_REFUNDED && o.payoutStatus === "blocked") continue;

        // Self-heal for `executeOrderRefund`'s two-phase refund (see that function): if Stripe
        // already refunded this charge but the app's own finalize transaction failed to run (a
        // crash, a DB blip, etc.), the `OrderRefundRequest` row is left at `refund_processing`
        // with no local record of ever reaching `refunded` — even though this very branch is
        // about to bring the Order itself back in sync. Grab the actual refund id off the charge
        // (falls back to null rather than failing the whole reconciliation over metadata).
        const stripeRefundId =
          ch.refunds?.data?.find((r) => r.status === "succeeded")?.id ?? ch.refunds?.data?.[0]?.id ?? null;

        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: o.id },
            data: {
              paymentStatus: PAYMENT_REFUNDED,
              status: "cancelled",
              payoutStatus: "blocked",
              payoutBlockedReason: "refunded",
              taxRefundedCents: o.taxAmountCents ?? 0,
            },
          });
          if (o.listingId) {
            await tx.listing.updateMany({
              where: { id: o.listingId, status: "sold" },
              data: { status: "ended" },
            });
          }
          await removeOrderFromLiveShippingSessionOnRefundTx(tx, o.id);
          const liveRoomId = o.liveShippingSession?.liveShowId ?? null;
          if (liveRoomId) {
            await reverseLiveShowCompletedSaleTx(tx, liveRoomId, o.itemPriceUsd);
          }
          await tx.orderRefundRequest.updateMany({
            where: { orderId: o.id, status: OrderRefundRequestStatus.refund_processing },
            data: { status: OrderRefundRequestStatus.refunded, refundedAt: new Date(), stripeRefundId },
          });
        });

        const title = o.listing?.title ?? "your order";
        await createNotification(prisma, {
          userId: o.buyerId,
          type: "order_refunded",
          title: "Refund completed",
          body: `Your refund for “${title}” has been processed.`,
          href: `/orders/${encodeURIComponent(o.id)}`,
        });
        await createNotification(prisma, {
          userId: o.sellerId,
          type: "order_refunded_seller",
          title: "Order refunded",
          body: `Order “${title}” was refunded to the buyer.`,
          href: `/account/sales/${encodeURIComponent(o.id)}`,
        });
        await logSellerCommerceEvent({
          sellerId: o.sellerId,
          listingId: o.listingId,
          orderId: o.id,
          kind: SELLER_COMMERCE_KIND.orderRefunded,
          title: "Refund issued",
          body: `Refund completed for “${title}” (via Stripe).`,
        });
        emitOrderLifecycleSync({
          orderId: o.id,
          parties: { sellerId: o.sellerId, buyerId: o.buyerId },
          listingId: o.listingId,
          orderStatus: "cancelled",
          paymentStatus: PAYMENT_REFUNDED,
        });
      }
      break;
    }
    // NOTE: Stripe's real event names are "charge.dispute.created" / "charge.dispute.closed" —
    // this handler previously listened for the non-existent "dispute.created", so it never fired
    // and disputed orders were never frozen (sellers could still be paid out on a chargeback).
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      const chId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
      if (!chId) break;
      const charge = await stripe.charges.retrieve(chId);
      const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!piId) break;
      const orderId = await resolveOrderIdForDisputedPaymentIntent(piId);
      const order = orderId
        ? await prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, sellerId: true, payoutStatus: true, listing: { select: { title: true } } },
          })
        : null;
      if (order) {
        // Freeze payout immediately — funds must not release while a chargeback is open. Only
        // move orders not already paid out; a dispute on an already-paid-out order still needs
        // manual review since automatic payout reversal isn't possible from here.
        if (order.payoutStatus === "paid_out") {
          await prisma.order.update({
            where: { id: order.id },
            data: { payoutStatus: "manual_review", payoutBlockedReason: "disputed_after_payout" },
          });
        } else {
          await prisma.order.updateMany({
            where: { id: order.id, payoutStatus: { not: "paid_out" } },
            data: { payoutStatus: "blocked", payoutBlockedReason: "disputed" },
          });
        }
        const title = order.listing?.title ?? "an order";
        await createNotification(prisma, {
          userId: order.sellerId,
          type: "stripe_dispute",
          title: "Payment dispute",
          body: `A payment dispute was opened for “${title}”. Payout is on hold until it's resolved.`,
          href: "/account/sales",
        });
      }
      break;
    }
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      const chId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
      if (!chId) break;
      const charge = await stripe.charges.retrieve(chId);
      const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!piId) break;
      const orderId = await resolveOrderIdForDisputedPaymentIntent(piId);
      const order = orderId
        ? await prisma.order.findUnique({
            where: { id: orderId },
            select: {
              id: true,
              sellerId: true,
              buyerId: true,
              listingId: true,
              paymentMethod: true,
              payoutBlockedReason: true,
              itemPriceUsd: true,
              taxAmountCents: true,
              listing: { select: { title: true } },
              liveShippingSession: { select: { liveShowId: true } },
            },
          })
        : null;
      if (!order) break;
      const title = order.listing?.title ?? "an order";
      if (dispute.status === "won") {
        // Only clear a hold this handler itself set — never override an unrelated admin block.
        await prisma.order.updateMany({
          where: { id: order.id, payoutBlockedReason: "disputed" },
          data: { payoutStatus: "held", payoutBlockedReason: null },
        });
        await createNotification(prisma, {
          userId: order.sellerId,
          type: "stripe_dispute",
          title: "Dispute resolved in your favor",
          body: `The dispute for “${title}” was resolved in your favor. Payout is unblocked.`,
          href: "/account/sales",
        });
      } else if (dispute.status === "lost") {
        // Chargeback: Stripe reverses the charge (and the seller's transferred share) outside
        // this app. Mirror `charge.refunded` bookkeeping — permanently block payout, mark the
        // order, and roll back any live-show GMV so later sales in the same show aren't taxed
        // at an incorrectly low tier because of a sale that was ultimately unwound.
        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: PAYMENT_CHARGEBACK,
              status: "cancelled",
              payoutStatus: "blocked",
              payoutBlockedReason: "chargeback",
              taxRefundedCents: order.taxAmountCents ?? 0,
            },
          });
          if (order.listingId) {
            await tx.listing.updateMany({ where: { id: order.listingId, status: "sold" }, data: { status: "ended" } });
          }
          await removeOrderFromLiveShippingSessionOnRefundTx(tx, order.id);
          const liveRoomId = order.liveShippingSession?.liveShowId ?? null;
          if (liveRoomId) {
            await reverseLiveShowCompletedSaleTx(tx, liveRoomId, order.itemPriceUsd);
          }
          // A chargeback can land on ANY installment's PaymentIntent (deposit, installment, or
          // balance payoff) — `resolveOrderIdForDisputedPaymentIntent` already found this order via
          // the `LayawayPayment` row when `Order.stripePaymentIntentId` didn't match directly. Once
          // resolved, unwind the layaway itself so it stops soliciting further installments from a
          // buyer whose bank has already reversed a charge on this plan.
          if (order.paymentMethod === OrderPaymentMethod.layaway) {
            const layaway = await tx.layaway.findFirst({ where: { orderId: order.id } });
            if (layaway && layaway.status !== LayawayStatus.refunded) {
              if (layaway.status === LayawayStatus.active) {
                await tx.layaway.update({
                  where: { id: layaway.id },
                  data: { status: LayawayStatus.refunded, remainingBalanceUsd: 0 },
                });
                await tx.listing.updateMany({
                  where: { id: layaway.listingId, status: "layaway_reserved" },
                  data: { status: "active", allowOffers: true },
                });
                await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
                  listingId: layaway.listingId,
                  userId: layaway.buyerId,
                });
              } else {
                // Already completed/defaulted/paid_off — just mark the plan as refunded for
                // reporting; listing lifecycle for a completed sale is handled by the "sold" ->
                // "ended" update above (item may already be with the buyer, so it is not re-listed).
                await tx.layaway.update({ where: { id: layaway.id }, data: { status: LayawayStatus.refunded } });
              }
            }
          }
        });
        await createNotification(prisma, {
          userId: order.sellerId,
          type: "stripe_dispute",
          title: "Dispute lost — chargeback",
          body: `The dispute for “${title}” was lost. The charge was reversed as a chargeback.`,
          href: "/account/sales",
        });
        await createNotification(prisma, {
          userId: order.buyerId,
          type: "order_refunded",
          title: "Dispute resolved",
          body: `Your dispute for “${title}” was resolved and the charge was reversed.`,
          href: `/orders/${encodeURIComponent(order.id)}`,
        });
        await logSellerCommerceEvent({
          sellerId: order.sellerId,
          listingId: order.listingId,
          orderId: order.id,
          kind: SELLER_COMMERCE_KIND.orderRefunded,
          title: "Chargeback",
          body: `Dispute for “${title}” was lost (chargeback).`,
        });
        emitOrderLifecycleSync({
          orderId: order.id,
          parties: { sellerId: order.sellerId, buyerId: order.buyerId },
          listingId: order.listingId,
          orderStatus: "cancelled",
          paymentStatus: PAYMENT_CHARGEBACK,
        });
      }
      break;
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      console.info("[stripe account.updated]", {
        accountId: account.id,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        currently_due: account.requirements?.currently_due ?? [],
        pending_verification: account.requirements?.pending_verification ?? [],
      });
      await syncStripeConnectUserRowsForAccountId(account.id);
      break;
    }
    case "capability.updated": {
      const cap = event.data.object as Stripe.Capability;
      const evtAccount = (event as unknown as { account?: string }).account;
      const capAccount = (cap as unknown as { account?: string }).account;
      const accountId =
        typeof evtAccount === "string"
          ? evtAccount
          : typeof capAccount === "string"
            ? capAccount
            : null;
      if (!accountId) break;
      console.info("[stripe capability.updated]", { accountId, capabilityId: cap.id });
      await syncStripeConnectUserRowsForAccountId(accountId);
      break;
    }
    default:
      break;
  }
}
