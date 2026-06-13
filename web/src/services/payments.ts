import Stripe from "stripe";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { EscrowStatus, OrderPaymentMethod } from "@/generated/prisma/enums";
import { createNotification } from "@/lib/notifications";
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
import { getStripe } from "@/lib/stripe";
import {
  buildCheckoutTaxSessionFields,
  buildMarketplaceCheckoutTaxBundle,
  loadSellerShipFromForTax,
  fetchCheckoutSessionTax,
  STRIPE_TAX_CODE_SHIPPING,
  STRIPE_TAX_CODE_TANGIBLE,
  stripeLineItemProductData,
  TAX_PROVIDER_STRIPE,
} from "@/lib/stripe-tax";
import {
  buyNowCheckoutSubtotalCents,
  reuseOpenCheckoutSessionIfMatching,
} from "@/lib/stripe-checkout-session";
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
import { LIVE_BUY_NOW_PI_KIND } from "@/lib/stripe-charge-order-saved-pm";
import { finalizeLiveTipPaid, markLiveTipCheckoutFailed } from "@/services/live-tips";
import { SELLER_COMMERCE_KIND, logSellerCommerceEvent } from "@/lib/seller-commerce-event";
import { logEscrowStatusTransition } from "@/lib/escrow-audit-log";
import { getEscrowProvider } from "@/services/escrow/factory";
import { assertValidEscrowTransition } from "@/services/escrow/state-machine";
import { emitOrderLifecycleSync } from "@/lib/marketplace/ecosystem-sync";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import { fulfillOrderShippingAfterPayment } from "@/services/shipping";
import {
  assertBuyNowAllowed,
  CommerceGuardError,
  loadListingCommerceContext,
} from "@/lib/marketplace/commerce-guards";
import { resolveMarketplaceCheckoutShipping } from "@/services/marketplace-checkout-shipping";
import { LayawayStatus } from "@/generated/prisma/enums";
import { initializeOrderPayoutOnPayment } from "@/services/payout/process-delivery-payout";
import {
  addOrderToLiveShippingSessionTx,
  estimateFirstItemLiveShippingCentsForListingTx,
} from "@/services/shipping/live-shipping-pricing";

/** @remarks Conceptually `payment_pending` — persisted value for compatibility. */
export const PAYMENT_PENDING = "pending_payment" as const;
export const PAYMENT_PAID = "paid" as const;
/** @remarks Conceptually `payment_failed` — persisted value for compatibility. */
export const PAYMENT_FAILED = "failed" as const;
export const PAYMENT_REFUNDED = "refunded" as const;
/** Auction winner did not complete checkout before `paymentDeadlineAt`. */
export const PAYMENT_EXPIRED = "expired" as const;
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
}

function siteUrl(): string {
  const u = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return u.replace(/\/$/, "");
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

  void fulfillOrderShippingAfterPayment(orderId);
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
    emitLayawayLifecycleSync({
      typedEvent: lay.orderId === orderId ? "layaway_paid_in_full" : "layaway_canceled",
      layawayId: lay.id,
      parties: { sellerId: lay.sellerId, buyerId: lay.buyerId },
      listingId: lay.listingId,
      orderId: lay.orderId,
      layawayStatus: lay.orderId === orderId ? "completed" : "canceled",
      listingStatus: "sold",
      orderStatus: "paid",
      paymentStatus: PAYMENT_PAID,
      extraPayload: { supersededByOrderId: orderId },
    });
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

async function syncOrderShippingFromLiveSessionTx(tx: TransactionClient, orderId: string) {
  const ord = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      itemPriceUsd: true,
      taxUsd: true,
      liveShippingSessionId: true,
      liveShippingSession: { select: { id: true, shippingCostCents: true, liveShowId: true } },
    },
  });
  if (!ord?.liveShippingSession?.id) {
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  }
  const paidOrders = await tx.order.findMany({
    where: {
      liveShippingSessionId: ord.liveShippingSession.id,
      paymentStatus: PAYMENT_PAID,
    },
    select: { id: true, shippingPriceUsd: true },
  });
  const alreadyChargedCents = paidOrders
    .filter((o) => o.id !== ord.id)
    .reduce((sum, o) => sum + Math.round(Math.max(0, o.shippingPriceUsd) * 100), 0);
  const remainingCents = Math.max(0, ord.liveShippingSession.shippingCostCents - alreadyChargedCents);
  const shippingPriceUsd = remainingCents / 100;
  return tx.order.update({
    where: { id: orderId },
    data: {
      shippingPriceUsd,
      totalUsd: ord.itemPriceUsd + shippingPriceUsd + ord.taxUsd,
    },
  });
}

/**
 * Buy now: create unpaid order + Stripe Checkout (MVP default). When `ESCROW_ENABLED=true` and provider
 * env is configured, high-value totals may use the alternate checkout path. Listing stays active until
 * payment is confirmed (Stripe or provider webhooks).
 */
export async function createBuyNowCheckoutSession(args: {
  buyerId: string;
  listingId: string;
  liveRoomItemId?: string | null;
  shipping: BuyNowShippingInput;
  successPath?: string;
  cancelPath?: string;
}): Promise<{ url: string }> {
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

  const liveRoomIdForFee = await resolveLiveRoomIdForLiveRoomItem(liveRoomItemId);
  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: order.itemPriceUsd,
    isCompanyListing: Boolean(listing.isCompanyListing),
    liveRoomId: liveRoomIdForFee,
  });
  const rowEscrow = order.paymentMethod === OrderPaymentMethod.escrow;

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
      throw e;
    }
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
        ...taxBundle.sessionFields,
        metadata: {
          kind: "buy_now",
          orderId: order.id,
          listingId: listing.id,
          buyerId: args.buyerId,
          liveRoomItemId: liveRoomItemId ?? "",
          ...taxBundle.metadata,
        },
        payment_intent_data: {
          application_fee_amount: feeCents,
          transfer_data: {
            destination: listing.seller.stripeAccountId!,
            ...(taxBundle.sellerTransferCents != null ? { amount: taxBundle.sellerTransferCents } : {}),
          },
          metadata: { orderId: order.id, kind: "buy_now" },
        },
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
      ...taxBundle.sessionFields,
      metadata: {
        kind: "pay_order",
        orderId: order.id,
        listingId: order.listingId,
        buyerId: args.buyerId,
        ...taxBundle.metadata,
      },
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: {
          destination: order.seller.stripeAccountId,
          ...(taxBundle.sellerTransferCents != null ? { amount: taxBundle.sellerTransferCents } : {}),
        },
        metadata: { orderId: order.id, kind: "pay_order" },
      },
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
      liveShippingSession: { select: { liveShowId: true } },
      listing: { select: { title: true, buyingFormat: true } },
    },
  });
  if (!order || order.paymentStatus === PAYMENT_PAID || order.paymentStatus === PAYMENT_EXPIRED) return;
  if (order.paymentMethod === OrderPaymentMethod.escrow) return;

  const taxFromSession =
    sessionId != null ? await fetchCheckoutSessionTax(sessionId) : null;
  const taxAmountCents = taxFromSession?.taxAmountCents ?? 0;
  const taxUsd = taxAmountCents / 100;
  const totalUsd = order.itemPriceUsd + order.shippingPriceUsd + taxUsd;

  const shippingChargedCents = Math.round(Math.max(0, order.shippingPriceUsd) * 100);

  const { closedLayaways } = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PAYMENT_PAID,
        status: "paid",
        stripePaymentIntentId: paymentIntentId ?? undefined,
        stripeCheckoutSessionId: sessionId ?? undefined,
        shippingChargedCents,
        taxAmountCents,
        taxUsd,
        taxProvider: taxAmountCents > 0 ? TAX_PROVIDER_STRIPE : null,
        stripeTaxCalculationId: taxFromSession?.stripeTaxCalculationId ?? null,
        totalUsd,
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

  void fulfillOrderShippingAfterPayment(orderId);
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

        const liveRoomItemId = session.metadata?.liveRoomItemId;
        if (liveRoomItemId && kind === "buy_now") {
          const item = await prisma.liveRoomItem.findFirst({
            where: { id: liveRoomItemId, listingId: session.metadata?.listingId ?? undefined },
            select: { id: true, liveRoomId: true, status: true },
          });
          if (item && item.status !== "sold") {
            const changed = await prisma.liveRoomItem.updateMany({
              where: { id: item.id, status: { not: "sold" } },
              data: { status: "sold", itemVersion: { increment: 1 } },
            });
            if (changed.count > 0) {
              const itemNext = await prisma.liveRoomItem.findUnique({
                where: { id: item.id },
                select: { id: true, itemVersion: true, liveRoomId: true },
              });
              if (itemNext) {
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
            }
          }
        }
        return;
      }

      if (kind === "break_spot") {
        const breakSpotId = session.metadata?.breakSpotId;
        if (!breakSpotId) return;
        await prisma.breakSpot.update({
          where: { id: breakSpotId },
          data: {
            claimStatus: "paid",
            paidAt: new Date(),
            breakPaymentStatus: PAYMENT_PAID,
            stripePaymentIntentId: pi ?? undefined,
            stripeCheckoutSessionId: session.id,
          },
        });
        const spot = await prisma.breakSpot.findUnique({
          where: { id: breakSpotId },
          select: { liveRoomId: true, userId: true, spotLabel: true, priceUsd: true },
        });
        if (spot) {
          if (Number.isFinite(spot.priceUsd) && spot.priceUsd > 0) {
            await prisma.$transaction(async (tx) => {
              await recordLiveShowCompletedSaleTx(tx, spot.liveRoomId, spot.priceUsd!);
            });
          }
          emitLiveRoomMessagesRefetch(spot.liveRoomId);
          await createNotification(prisma, {
            userId: spot.userId,
            type: "break_spot_paid",
            title: "Spot paid",
            body: `Payment confirmed for ${spot.spotLabel}.`,
            href: `/live/${encodeURIComponent(spot.liveRoomId)}`,
          });
        }
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
      const orders = await prisma.order.findMany({ where: { stripePaymentIntentId: piId }, select: { id: true } });
      for (const o of orders) {
        await prisma.order.update({
          where: { id: o.id },
          data: { paymentStatus: PAYMENT_REFUNDED, status: "cancelled" },
        });
      }
      break;
    }
    case "dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      const chId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
      if (!chId) break;
      const charge = await stripe.charges.retrieve(chId);
      const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!piId) break;
      const order = await prisma.order.findFirst({ where: { stripePaymentIntentId: piId }, select: { sellerId: true, id: true } });
      if (order) {
        await createNotification(prisma, {
          userId: order.sellerId,
          type: "stripe_dispute",
          title: "Payment dispute",
          body: "A dispute was opened on an order. Check Stripe Dashboard.",
          href: "/account/sales",
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
