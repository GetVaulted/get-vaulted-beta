import { OrderPaymentMethod } from "@/generated/prisma/enums";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import { canBuyerUpdateOrderShipping, isIncompleteOrderShipping } from "@/lib/order-shipping-guards";
import { isShippingAddressCompleteForLabels } from "@/lib/address-book";
import { isEscrowConfigured, orderTotalQualifiesForEscrow } from "@/lib/escrow-config";
import {
  releaseActiveInventoryHoldsForListingAndBuyerTx,
  reserveListingInventoryHoldTx,
} from "@/lib/live-auction-inventory-hold";
import { getBuyerDefaultCardPaymentMethodId } from "@/lib/stripe-customer";
import { isStripePaymentMethodId } from "@/lib/stripe-payment-method-id";
import { sanitizeStripePaymentIntentId } from "@/lib/stripe-payment-intent-id";
import {
  addOrderToLiveShippingSessionTx,
  estimateFirstItemLiveShippingCentsForListingTx,
} from "@/services/shipping/live-shipping-pricing";
import {
  finalizeStripeMarketplaceOrderPaid,
  PAYMENT_FAILED,
  PAYMENT_PAID,
  PAYMENT_PENDING,
} from "@/services/payments";
import { emitLiveRoomMessagesRefetch, emitPurchaseCompleted } from "@/lib/realtime-emit-server";
import { resolveLiveBuyNowUnitSale } from "@/lib/live-room-item-quantity-display";
import { ensureLiveBuyNowItemCheckoutListingTx } from "@/lib/live-buy-now-checkout-listing";
import { createNotification } from "@/lib/notifications";
import { liveRoomBuyerPaymentConfirmedNotification } from "@/lib/live-room-payment-notify-copy";
import { resolveLivePurchaseNotificationChargeUsd } from "@/lib/live-purchase-charge-total";
import { captureLiveRoomItemShippingSnapshotTx } from "@/services/shipping/live-item-shipping-snapshot";
import { liveSavedCardSellerReady, sellerStripeCollectSelect } from "@/lib/seller-stripe-collect-ready";
import { recordBuyerGiveawayPurchaseEntries } from "@/lib/live-giveaway";
import { reportUrgentPaymentAnomaly } from "@/lib/cron-anomaly-alert";
import { releaseReferralCreditReservation } from "@/lib/referral-credit";

export type BuyerShippingSnapshot = {
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  buyerAddressId: string;
};

export async function resolveBuyerDefaultShippingForOrder(
  userId: string,
): Promise<BuyerShippingSnapshot | null> {
  const addr = await prisma.address.findFirst({
    where: { userId, type: "shipping" },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return addr ? buyerShippingSnapshotFromAddress(addr) : null;
}

export function buyerShippingSnapshotFromAddress(addr: {
  id: string;
  fullName: string | null;
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone?: string | null;
}): BuyerShippingSnapshot | null {
  if (!isShippingAddressCompleteForLabels(addr)) {
    return null;
  }
  const line1 = addr.line1?.trim();
  const city = addr.city?.trim();
  const state = addr.state?.trim();
  const postalCode = addr.postalCode?.trim();
  if (!line1 || !city || !state || !postalCode) {
    return null;
  }
  const line2 = addr.line2?.trim();
  return {
    shipRecipientName: (addr.fullName?.trim() || addr.name?.trim() || "Buyer").slice(0, 160),
    shipAddress: line2 ? `${line1}, ${line2}` : line1,
    shipCity: city,
    shipState: state,
    shipZip: postalCode,
    shipCountry: (addr.country?.trim() || "US").slice(0, 2).toUpperCase(),
    buyerAddressId: addr.id,
  };
}

function orderShippingNeedsBuyerRefresh(order: {
  buyerAddressId: string | null;
  shipAddress: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipZip: string | null;
}): boolean {
  return isIncompleteOrderShipping(order);
}

type OrderShipToSelect = {
  id: true;
  buyerId: true;
  status: true;
  buyerAddressId: true;
  shipRecipientName: true;
  shipAddress: true;
  shipCity: true;
  shipState: true;
  shipZip: true;
  shipCountry: true;
  fulfillmentStatus: true;
  shippoTransactionId: true;
  labelUrl: true;
  trackingNumber: true;
};

const orderShipToSelect = {
  id: true,
  buyerId: true,
  status: true,
  buyerAddressId: true,
  shipRecipientName: true,
  shipAddress: true,
  shipCity: true,
  shipState: true,
  shipZip: true,
  shipCountry: true,
  fulfillmentStatus: true,
  shippoTransactionId: true,
  labelUrl: true,
  trackingNumber: true,
} satisfies OrderShipToSelect;

function orderShipToMatchesSnapshot(
  order: {
    buyerAddressId: string | null;
    shipRecipientName: string | null;
    shipAddress: string | null;
    shipCity: string | null;
    shipState: string | null;
    shipZip: string | null;
    shipCountry: string | null;
  },
  shipping: BuyerShippingSnapshot,
): boolean {
  return (
    order.buyerAddressId === shipping.buyerAddressId &&
    (order.shipRecipientName ?? "").trim() === shipping.shipRecipientName &&
    (order.shipAddress ?? "").trim() === shipping.shipAddress &&
    (order.shipCity ?? "").trim() === shipping.shipCity &&
    (order.shipState ?? "").trim() === shipping.shipState &&
    (order.shipZip ?? "").trim() === shipping.shipZip &&
    (order.shipCountry ?? "").trim().toUpperCase() === shipping.shipCountry
  );
}

async function writeBuyerShippingOntoOrder(
  orderId: string,
  order: {
    fulfillmentStatus: string;
    shippoTransactionId: string | null;
    labelUrl: string | null;
  },
  shipping: BuyerShippingSnapshot,
): Promise<void> {
  const resetException =
    order.fulfillmentStatus === "exception" &&
    !order.shippoTransactionId?.trim() &&
    !order.labelUrl?.trim();

  await prisma.order.update({
    where: { id: orderId },
    data: {
      shipRecipientName: shipping.shipRecipientName,
      shipAddress: shipping.shipAddress,
      shipCity: shipping.shipCity,
      shipState: shipping.shipState,
      shipZip: shipping.shipZip,
      shipCountry: shipping.shipCountry,
      buyerAddressId: shipping.buyerAddressId,
      ...(resetException ? { fulfillmentStatus: "pending" } : {}),
    },
  });
}

/** Refresh buyer Wallet default onto an order when ship-to placeholders are stale (including paid orders). */
export async function refreshBuyerShippingOnOrderIfIncomplete(
  orderId: string,
): Promise<
  { ok: true; updated: boolean } | { ok: false; code: "ORDER_NOT_FOUND" | "NO_SHIPPING_ADDRESS" }
> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: orderShipToSelect,
  });
  if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
  if (!isIncompleteOrderShipping(order)) return { ok: true, updated: false };

  const shipping = await resolveBuyerDefaultShippingForOrder(order.buyerId);
  if (!shipping) return { ok: false, code: "NO_SHIPPING_ADDRESS" };

  await writeBuyerShippingOntoOrder(orderId, order, shipping);
  return { ok: true, updated: true };
}

/**
 * Copy the buyer's current Wallet default ship-to onto an order before a label exists.
 * Works for paid orders with a complete-but-wrong address (unlike incomplete-only refresh).
 */
export async function applyBuyerWalletShippingToOrder(
  orderId: string,
  buyerId: string,
): Promise<
  | { ok: true; updated: boolean; shipping: BuyerShippingSnapshot }
  | {
      ok: false;
      code:
        | "ORDER_NOT_FOUND"
        | "FORBIDDEN"
        | "NO_SHIPPING_ADDRESS"
        | "LABEL_EXISTS"
        | "ALREADY_SHIPPED"
        | "TERMINAL";
    }
> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: orderShipToSelect,
  });
  if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
  if (order.buyerId !== buyerId) return { ok: false, code: "FORBIDDEN" };

  const gate = canBuyerUpdateOrderShipping(order);
  if (!gate.ok) return { ok: false, code: gate.code };

  const shipping = await resolveBuyerDefaultShippingForOrder(buyerId);
  if (!shipping) return { ok: false, code: "NO_SHIPPING_ADDRESS" };

  if (orderShipToMatchesSnapshot(order, shipping)) {
    return { ok: true, updated: false, shipping };
  }

  await writeBuyerShippingOntoOrder(orderId, order, shipping);
  return { ok: true, updated: true, shipping };
}

/** After Wallet shipping changes, push the new default onto all pre-label open orders. */
export async function syncBuyerWalletShippingToOpenOrders(
  buyerId: string,
): Promise<{ updatedOrderIds: string[]; skipped: number }> {
  const shipping = await resolveBuyerDefaultShippingForOrder(buyerId);
  if (!shipping) return { updatedOrderIds: [], skipped: 0 };

  const orders = await prisma.order.findMany({
    where: {
      buyerId,
      status: { notIn: ["cancelled", "delivered", "completed", "shipped"] },
      OR: [{ labelUrl: null }, { labelUrl: "" }],
    },
    select: orderShipToSelect,
    take: 100,
    orderBy: { createdAt: "desc" },
  });

  const updatedOrderIds: string[] = [];
  let skipped = 0;
  for (const order of orders) {
    const gate = canBuyerUpdateOrderShipping(order);
    if (!gate.ok) {
      skipped += 1;
      continue;
    }
    if (orderShipToMatchesSnapshot(order, shipping)) {
      skipped += 1;
      continue;
    }
    await writeBuyerShippingOntoOrder(order.id, order, shipping);
    updatedOrderIds.push(order.id);
  }
  return { updatedOrderIds, skipped };
}

export async function syncBuyerDefaultShippingToPendingOrder(
  orderId: string,
  buyerId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await syncBuyerDefaultShippingToPendingOrderTx(tx, orderId, buyerId);
  });
}

export async function syncBuyerDefaultShippingToPendingOrderTx(
  tx: TransactionClient,
  orderId: string,
  buyerId: string,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      buyerId: true,
      paymentStatus: true,
      buyerAddressId: true,
      shipAddress: true,
      shipCity: true,
      shipState: true,
      shipZip: true,
    },
  });
  if (!order || order.buyerId !== buyerId || order.paymentStatus === PAYMENT_PAID) return;

  const addr = await tx.address.findFirst({
    where: { userId: buyerId, type: "shipping" },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  const shipping = addr ? buyerShippingSnapshotFromAddress(addr) : null;
  if (!shipping) throw new Error("NO_SHIPPING_ADDRESS");

  const needsUpdate =
    order.buyerAddressId !== shipping.buyerAddressId ||
    (order.shipAddress ?? "").trim() !== shipping.shipAddress ||
    (order.shipCity ?? "").trim() !== shipping.shipCity ||
    (order.shipState ?? "").trim() !== shipping.shipState ||
    (order.shipZip ?? "").trim() !== shipping.shipZip;

  if (!needsUpdate && !orderShippingNeedsBuyerRefresh(order)) return;

  await tx.order.update({
    where: { id: orderId },
    data: {
      shipRecipientName: shipping.shipRecipientName,
      shipAddress: shipping.shipAddress,
      shipCity: shipping.shipCity,
      shipState: shipping.shipState,
      shipZip: shipping.shipZip,
      shipCountry: shipping.shipCountry,
      buyerAddressId: shipping.buyerAddressId,
    },
  });
}

export async function createLiveBuyNowOrder(args: {
  buyerId: string;
  liveRoomId: string;
  liveRoomItemId: string;
}): Promise<
  | {
      ok: true;
      orderId: string;
      listingId: string;
      itemTitle: string;
      amountUsd: number;
      sellerId: string;
    }
  | { ok: false; code: string; error: string }
> {
  const shipping = await resolveBuyerDefaultShippingForOrder(args.buyerId);
  if (!shipping) {
    return { ok: false, code: "NO_SHIPPING", error: "Add a shipping address to your Wallet before buying." };
  }

  // Resolved BEFORE opening the transaction below — this calls out to Stripe
  // (`assertPaymentMethodOwnedByUser` / `resolveDefaultPaymentMethodId`), and Prisma's default
  // interactive-transaction timeout is 5s. Running it inside `prisma.$transaction()` let ordinary
  // Stripe API latency blow the transaction's time budget, aborting with an unrecognized Prisma
  // timeout error that fell into the generic "Could not start purchase. Try again in a moment."
  // catch-all below — every buy-now purchase was exposed to this, not just newly added items.
  const pmId = await getBuyerDefaultCardPaymentMethodId(args.buyerId);
  if (!pmId || !isStripePaymentMethodId(pmId)) {
    return { ok: false, code: "NO_SAVED_CARD", error: "Add a saved payment method to your Wallet." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialize concurrent purchase attempts for the SAME live item before touching anything.
      // Without this, two requests racing "does this item already have a linked listing" (in
      // `ensureLiveBuyNowItemCheckoutListingTx` below) could both read no-listing-yet and each
      // independently mint their own Listing + Order for what should be a single unit — a buyer
      // ends up owning two items while only one payment actually goes through. A transaction-
      // scoped advisory lock queues the second request behind the first and releases itself
      // automatically on commit or rollback (no separate unlock call, no orphaned-lock risk).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${args.liveRoomItemId}))`;

      const item = await tx.liveRoomItem.findFirst({
        where: {
          id: args.liveRoomItemId,
          liveRoomId: args.liveRoomId,
          // Buy Now lots are purchasable whether the host has pinned them (`active`) or they are
          // still queued in the lineup. Terminal states (sold/skipped) fall through to not-found.
          status: { in: ["queued", "active"] },
          // Any live room type — a host can pin a fixed-price lot during a sale, auction, or
          // break/PYT/PYD show. The listing `buyingFormat === "buy_now"` check below is the real
          // guard that keeps auction lots and variant boards out of this buy path.
          liveRoom: { sellerId: { not: args.buyerId }, status: "live" },
        },
        select: {
          id: true,
          title: true,
        },
      });
      if (!item) throw Object.assign(new Error("LIVE_ITEM_INVALID"), { code: "LIVE_ITEM_INVALID" });

      const ensured = await ensureLiveBuyNowItemCheckoutListingTx(tx, {
        liveRoomId: args.liveRoomId,
        liveRoomItemId: item.id,
      });
      if (!ensured.ok) {
        throw Object.assign(new Error(ensured.code), { code: ensured.code });
      }

      const listingRow = await tx.listing.findUnique({
        where: { id: ensured.listingId },
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
          seller: { select: sellerStripeCollectSelect },
        },
      });
      if (!listingRow || listingRow.buyingFormat !== "buy_now") {
        throw Object.assign(new Error("NOT_BUY_NOW"), { code: "NOT_BUY_NOW" });
      }
      if (listingRow.status !== "active" || listingRow.moderationRemovedAt) {
        throw Object.assign(new Error("NOT_AVAILABLE"), { code: "NOT_AVAILABLE" });
      }
      if (listingRow.sellerId === args.buyerId) {
        throw Object.assign(new Error("OWN_LISTING"), { code: "OWN_LISTING" });
      }
      // Same readiness bar as live variant / break-spot saved-card charge — do not use the
      // stricter Connect requirements check here or buyers get an unmapped STRIPE_ONBOARDING_REQUIRED
      // → "Could not start purchase." while PYD spots on the same seller still charge fine.
      if (!liveSavedCardSellerReady(listingRow.seller)) {
        throw Object.assign(new Error("SELLER_NOT_READY"), { code: "SELLER_NOT_READY" });
      }

      const itemPriceUsd = listingRow.priceUsd;
      const taxUsd = 0;
      const liveShipEstimateCents = await estimateFirstItemLiveShippingCentsForListingTx(tx, listingRow.id);
      const escrowSubtotalUsd = itemPriceUsd + liveShipEstimateCents / 100 + taxUsd;
      if (orderTotalQualifiesForEscrow(escrowSubtotalUsd) && isEscrowConfigured()) {
        throw Object.assign(new Error("USE_ESCROW_CHECKOUT"), { code: "USE_ESCROW_CHECKOUT" });
      }

      const existing = await tx.order.findUnique({ where: { listingId: listingRow.id } });
      if (existing?.paymentStatus === PAYMENT_PAID) {
        throw Object.assign(new Error("ALREADY_SOLD"), { code: "ALREADY_SOLD" });
      }
      // A FAILED charge is a final outcome — it can never later succeed, so it must never lock
      // every other buyer out of the listing. This used to only get cleaned up when the SAME
      // buyer who was declined came back and retried (the `existing.buyerId !== args.buyerId`
      // check below threw CHECKOUT_IN_PROGRESS first for anyone else). One buyer's declined card
      // permanently blocked every other buyer with "Another buyer is checking out this item"
      // until that exact buyer retried. Clear it here regardless of whose order it was.
      if (existing?.paymentStatus === PAYMENT_FAILED) {
        await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
          listingId: listingRow.id,
          userId: existing.buyerId,
        });
        await tx.order.delete({ where: { id: existing.id } });
      } else if (existing && existing.buyerId !== args.buyerId) {
        // A genuinely in-flight PENDING order from a different buyer is real protection against
        // two buyers racing to check out the same listing at once — still block that case.
        throw Object.assign(new Error("CHECKOUT_IN_PROGRESS"), { code: "CHECKOUT_IN_PROGRESS" });
      } else if (existing?.paymentStatus === PAYMENT_PENDING) {
        // Same buyer retrying their own still-pending order.
        await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
          listingId: listingRow.id,
          userId: existing.buyerId,
        });
        await tx.order.delete({ where: { id: existing.id } });
      }

      await reserveListingInventoryHoldTx(tx, {
        listingId: listingRow.id,
        userId: args.buyerId,
        source: "live_buy_now_saved_pm",
        liveRoomItemId: item.id,
      });

      const orderRow = await tx.order.create({
        data: {
          listingId: listingRow.id,
          buyerId: args.buyerId,
          sellerId: listingRow.sellerId,
          itemPriceUsd,
          shippingPriceUsd: 0,
          taxUsd,
          totalUsd: itemPriceUsd + taxUsd,
          status: "pending",
          paymentStatus: PAYMENT_PENDING,
          fulfillmentStatus: "pending",
          shipRecipientName: shipping.shipRecipientName,
          shipAddress: shipping.shipAddress,
          shipCity: shipping.shipCity,
          shipState: shipping.shipState,
          shipZip: shipping.shipZip,
          shipCountry: shipping.shipCountry,
          buyerAddressId: shipping.buyerAddressId,
          sellerShipFromAddressId: listingRow.shipFromAddressId ?? null,
          paymentMethod: OrderPaymentMethod.stripe,
          paymentLabel: pmId,
        },
      });

      await addOrderToLiveShippingSessionTx(tx, orderRow.id, { liveShowId: args.liveRoomId });
      const synced = await tx.order.findUniqueOrThrow({ where: { id: orderRow.id } });

      return {
        orderId: synced.id,
        listingId: listingRow.id,
        itemTitle: item.title.trim() || listingRow.title,
        amountUsd: synced.totalUsd,
        sellerId: listingRow.sellerId,
      };
    });

    return { ok: true, ...result };
  } catch (e) {
    const messages: Record<string, string> = {
      LIVE_ITEM_INVALID: "This item is not available to buy.",
      NOT_BUY_NOW: "This listing is not buy-now.",
      NOT_AVAILABLE: "This listing is not available.",
      OWN_LISTING: "You cannot buy your own listing.",
      SELLER_NOT_READY: "Seller payouts are not ready.",
      STRIPE_ONBOARDING_REQUIRED: "Seller payouts are not ready.",
      LISTING_INVENTORY_HELD: "Another buyer is checking out this item.",
      USE_ESCROW_CHECKOUT: "This purchase requires escrow checkout.",
      ALREADY_SOLD: "This item was already sold.",
      CHECKOUT_IN_PROGRESS: "Another buyer is checking out this item.",
      NO_SAVED_CARD: "Add a saved payment method to your Wallet.",
      NO_PRICE: "This item needs a price before checkout.",
      NO_SHIPPING: "Add a shipping address to your Wallet before buying.",
      NO_SHIPPING_ADDRESS: "Add a shipping address to your Wallet before buying.",
      LIVE_SHIPPING_NOT_APPLICABLE: "Shipping is not set up for this show yet.",
      LIVE_SHIPPING_SELLER_MISMATCH: "Checkout could not link this purchase to the show — try again.",
      LIVE_SHIPPING_SESSION_NOT_FOUND: "Could not link this purchase to live shipping — try again.",
      ORDER_CREATE_FAILED: "Could not start purchase. Try again in a moment.",
    };
    const rawCode =
      e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string"
        ? String((e as { code: string }).code).trim()
        : "";
    // Prefer explicit `.code`, then SCREAMING_SNAKE Error.message (inventory hold / shipping), else
    // Prisma P2xxx → generic create failure (never surface raw Prisma codes to buyers).
    const messageCode =
      e instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(e.message.trim()) ? e.message.trim() : "";
    const code =
      (rawCode && !/^P\d{4}$/.test(rawCode) && rawCode) ||
      messageCode ||
      (rawCode.startsWith("P") ? "ORDER_CREATE_FAILED" : "") ||
      "ORDER_CREATE_FAILED";
    // The buyer-facing message for an unmapped code is a generic "try again" — log the real
    // error here or every occurrence is undiagnosable from the client alone.
    if (!messages[code]) {
      console.error("[live-buy-now] order create failed", {
        liveRoomId: args.liveRoomId,
        liveRoomItemId: args.liveRoomItemId,
        buyerId: args.buyerId,
        code,
        rawCode,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
    }
    return { ok: false, code, error: messages[code] ?? "Could not start purchase." };
  }
}

export async function finalizeLiveBuyNowPurchaseComplete(args: {
  orderId: string;
  liveRoomId: string;
  liveRoomItemId: string;
  paymentIntentId?: string | null;
}): Promise<void> {
  // Guard (bug #18): callers charging via the PayPal/Venmo buyer rail pass their PayPal capture
  // id through `paymentIntentId` — only a real Stripe PaymentIntent id may reach
  // `finalizeStripeMarketplaceOrderPaid` (which itself sanitizes too, but fail closest to the
  // source). PayPal-rail orders are already stamped correctly via `stampOrderPaidViaPayPalRail`.
  const stripePaymentIntentId = sanitizeStripePaymentIntentId(args.paymentIntentId);
  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      paymentStatus: true,
      itemPriceUsd: true,
      listing: { select: { title: true } },
      buyer: { select: { username: true } },
    },
  });
  if (!order) return;

  if (order.paymentStatus !== PAYMENT_PAID) {
    await finalizeStripeMarketplaceOrderPaid(args.orderId, stripePaymentIntentId, null);
  }

  const item = await prisma.liveRoomItem.findFirst({
    where: { id: args.liveRoomItemId, liveRoomId: args.liveRoomId },
    select: {
      id: true,
      status: true,
      title: true,
      quantity: true,
      quantityInitial: true,
      itemVersion: true,
      liveRoomId: true,
    },
  });
  if (!item) return;

  let roomVersion = 0;
  let itemVersion = item.itemVersion ?? 0;
  let itemSoldOut = item.status === "sold";
  if (item.status !== "sold") {
    await prisma.$transaction(async (tx) => {
      await captureLiveRoomItemShippingSnapshotTx(tx, item.id);
    });
    const sale = resolveLiveBuyNowUnitSale({
      title: item.title,
      quantity: item.quantity,
      quantityInitial: item.quantityInitial,
      status: item.status,
    });
    itemSoldOut = sale.itemSoldOut;
    const changed = await prisma.liveRoomItem.updateMany({
      where: { id: item.id, status: { not: "sold" } },
      data: {
        quantity: sale.quantity,
        status: sale.status,
        itemVersion: { increment: 1 },
      },
    });
    if (changed.count > 0) {
      const itemNext = await prisma.liveRoomItem.findUnique({
        where: { id: item.id },
        select: { itemVersion: true },
      });
      itemVersion = itemNext?.itemVersion ?? itemVersion + 1;
      const roomNext = await prisma.liveRoom.update({
        where: { id: args.liveRoomId },
        data: { roomVersion: { increment: 1 } },
        select: { roomVersion: true },
      });
      roomVersion = roomNext.roomVersion;
    }
  } else {
    const room = await prisma.liveRoom.findUnique({
      where: { id: args.liveRoomId },
      select: { roomVersion: true },
    });
    roomVersion = room?.roomVersion ?? 0;
  }

  emitLiveRoomMessagesRefetch(args.liveRoomId);
  emitPurchaseCompleted(args.liveRoomId, args.liveRoomItemId, {
    roomVersion,
    itemVersion,
    winnerUsername: order.buyer.username ?? null,
    winnerId: order.buyerId,
    winningAmountUsd: order.itemPriceUsd,
    orderId: order.id,
    paymentStatus: "paid",
    itemSoldOut,
  });
  void recordBuyerGiveawayPurchaseEntries(args.liveRoomId, order.buyerId, order.id).catch((e) => {
    console.error("[live-buy-now] buyers giveaway entry", e);
  });
}

export async function finalizeBreakSpotPaid(args: {
  breakSpotId: string;
  paymentIntentId?: string | null;
}): Promise<{ liveRoomId: string; buyerId: string; amountUsd: number; spotLabel: string } | null> {
  // Guard (bug #18): the PayPal/Venmo break-spot rail (live-payment-pipeline.ts) passes its PayPal
  // capture id through this same slot — never let it reach BreakSpot.stripePaymentIntentId or
  // Order.stripePaymentIntentId.
  const stripePaymentIntentId = sanitizeStripePaymentIntentId(args.paymentIntentId);
  const spot = await prisma.breakSpot.findUnique({
    where: { id: args.breakSpotId },
    select: {
      id: true,
      liveRoomId: true,
      userId: true,
      spotLabel: true,
      priceUsd: true,
      claimStatus: true,
      breakPaymentStatus: true,
    },
  });
  if (!spot) return null;
  const alreadyPaid = spot.breakPaymentStatus === PAYMENT_PAID && spot.claimStatus === "paid";

  const spotWithOrder = await prisma.breakSpot.findUnique({
    where: { id: args.breakSpotId },
    select: { fulfillmentOrderId: true, stripePaymentIntentId: true },
  });
  if (spotWithOrder?.fulfillmentOrderId) {
    try {
      await finalizeStripeMarketplaceOrderPaid(
        spotWithOrder.fulfillmentOrderId,
        stripePaymentIntentId ?? sanitizeStripePaymentIntentId(spotWithOrder.stripePaymentIntentId),
        null,
      );
    } catch (e) {
      // FIX 4: same as the variant-purchase path — the spot will still be marked "paid" below
      // (Stripe already confirmed the charge), but a failed Order finalize is a serious
      // buyer-paid/order-unpaid inconsistency that must be loudly alerted, not just logged.
      console.error("[break spot] finalize fulfillment order failed", { breakSpotId: args.breakSpotId, e });
      reportUrgentPaymentAnomaly(
        "live-break-spot-order-finalize-failed",
        `finalizeStripeMarketplaceOrderPaid threw for a PAID break spot — the spot will still be marked paid (Stripe already charged the buyer) but the linked Order may remain unpaid. MANUAL RECONCILIATION REQUIRED. breakSpotId=${args.breakSpotId} fulfillmentOrderId=${spotWithOrder.fulfillmentOrderId} error=${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  if (alreadyPaid) {
    return {
      liveRoomId: spot.liveRoomId,
      buyerId: spot.userId,
      amountUsd: spot.priceUsd,
      spotLabel: spot.spotLabel,
    };
  }

  // Atomic compare-and-swap (FIX 3): mirrors `finalizeLiveItemVariantPurchasePaid`'s guard against
  // the same race — this function is invoked from multiple independent triggers for the same spot
  // (a direct `settleLiveBreakSpotPayment` call, the Stripe `payment_intent.succeeded` webhook, and
  // payment-failure recovery), which can race in after all reading `breakPaymentStatus` as not-yet-
  // paid. A plain read-then-write here would let every racing caller run side effects below (most
  // importantly duplicate buyer notifications and duplicate GMV recording). Only the caller whose
  // `updateMany` actually flips the row wins the claim; every other caller (`count === 0`) returns
  // early and skips all side effects below.
  const claimed = await prisma.breakSpot.updateMany({
    where: { id: spot.id, breakPaymentStatus: { not: PAYMENT_PAID } },
    data: {
      claimStatus: "paid",
      paidAt: new Date(),
      breakPaymentStatus: PAYMENT_PAID,
      stripePaymentIntentId: stripePaymentIntentId ?? undefined,
      stripeCheckoutSessionId: null,
    },
  });
  if (claimed.count === 0) {
    return {
      liveRoomId: spot.liveRoomId,
      buyerId: spot.userId,
      amountUsd: spot.priceUsd,
      spotLabel: spot.spotLabel,
    };
  }

  const { markBreakSpotExternalFulfillmentRequired } = await import(
    "@/services/shipping/break-pyt-fulfillment-bridge"
  );
  await markBreakSpotExternalFulfillmentRequired(spot.id);

  // `finalizeStripeMarketplaceOrderPaid` above already records live-show completed-sale GMV for
  // the linked fulfillment order (same dollar amount as `spot.priceUsd`). Only record here
  // directly when there is no fulfillment order, otherwise this double-counts GMV and skews
  // live fee-tier calculations.
  if (!spotWithOrder?.fulfillmentOrderId && Number.isFinite(spot.priceUsd) && spot.priceUsd > 0) {
    await prisma.$transaction(async (tx) => {
      const { recordLiveShowCompletedSaleTx } = await import("@/lib/live-show-gmv");
      await recordLiveShowCompletedSaleTx(tx, spot.liveRoomId, spot.priceUsd);
    });
  }

  const { emitBreakSpotsChanged, emitLiveRoomMessagesRefetch } = await import("@/lib/realtime-emit-server");
  emitBreakSpotsChanged(spot.liveRoomId);
  emitLiveRoomMessagesRefetch(spot.liveRoomId);

  if (Number.isFinite(spot.priceUsd) && spot.priceUsd > 0) {
    const chargeTotalUsd = await resolveLivePurchaseNotificationChargeUsd({
      fallbackUsd: spot.priceUsd,
      fulfillmentOrderId: spotWithOrder?.fulfillmentOrderId,
      stripePaymentIntentId: stripePaymentIntentId ?? sanitizeStripePaymentIntentId(spotWithOrder?.stripePaymentIntentId),
    });
    const paymentNote = liveRoomBuyerPaymentConfirmedNotification({
      amountUsd: chargeTotalUsd,
      href: "/account/orders?view=live",
    });
    await createNotification(prisma, {
      userId: spot.userId,
      ...paymentNote,
    });
  }

  return {
    liveRoomId: spot.liveRoomId,
    buyerId: spot.userId,
    amountUsd: spot.priceUsd,
    spotLabel: spot.spotLabel,
  };
}

/**
 * Release a break spot claim so another buyer can take the label.
 * Used when the host cancels a stuck payment retry (or other confirmed abandon paths).
 * Never call while a successful charge may still settle — releasing would allow a double sell.
 *
 * A `BreakSpot` row IS the claim — `@@unique([liveRoomId, spotLabel])` means the row must be
 * deleted for a different buyer to claim the same label.
 */
export async function releaseBreakSpotOnDefiniteFailure(breakSpotId: string): Promise<void> {
  const spot = await prisma.breakSpot.findUnique({
    where: { id: breakSpotId },
    select: {
      id: true,
      liveRoomId: true,
      liveRoomItemId: true,
      claimStatus: true,
      breakPaymentStatus: true,
      fulfillmentOrderId: true,
    },
  });
  if (!spot) return;
  // Never release a spot that's already paid — a failure recorded after the fact (e.g. a delayed
  // webhook) must not undo a successful charge.
  if (spot.claimStatus === "paid" || spot.breakPaymentStatus === PAYMENT_PAID) return;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.breakSpot.delete({ where: { id: breakSpotId } });
      if (spot.liveRoomItemId) {
        const { refreshLiveRoomItemSoldAfterBreakSpotChange } = await import(
          "@/lib/live-room-break-quantity"
        );
        await refreshLiveRoomItemSoldAfterBreakSpotChange(tx, spot.liveRoomItemId);
      }
    });
  } catch (e) {
    // P2025 = already deleted/released by a concurrent caller — nothing left to release.
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code !== "P2025") throw e;
    return;
  }

  if (spot.fulfillmentOrderId) {
    const { releaseStoreCreditAndRestoreOrder } = await import("@/lib/store-credit-release");
    releaseStoreCreditAndRestoreOrder(spot.fulfillmentOrderId).catch((e) =>
      console.error("[store-credit] release failed (break spot definite failure)", {
        breakSpotId,
        orderId: spot.fulfillmentOrderId,
        error: e,
      }),
    );
  }

  const { emitBreakSpotsChanged } = await import("@/lib/realtime-emit-server");
  emitBreakSpotsChanged(spot.liveRoomId);
}
