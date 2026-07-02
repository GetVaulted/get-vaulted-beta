import { OrderPaymentMethod } from "@/generated/prisma/enums";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import { isIncompleteOrderShipping } from "@/lib/order-shipping-guards";
import { isShippingAddressCompleteForLabels } from "@/lib/address-book";
import { isEscrowConfigured, orderTotalQualifiesForEscrow } from "@/lib/escrow-config";
import {
  releaseActiveInventoryHoldsForListingAndBuyerTx,
  reserveListingInventoryHoldTx,
} from "@/lib/live-auction-inventory-hold";
import { getBuyerDefaultCardPaymentMethodId } from "@/lib/stripe-customer";
import { isStripePaymentMethodId } from "@/lib/stripe-payment-method-id";
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
import { createNotification } from "@/lib/notifications";
import { liveRoomBuyerPaymentConfirmedNotification } from "@/lib/live-room-payment-notify-copy";
import { captureLiveRoomItemShippingSnapshotTx } from "@/services/shipping/live-item-shipping-snapshot";
import { assertSellerStripeCollectReadyFromUser, sellerStripeCollectSelect } from "@/lib/seller-stripe-collect-ready";
import { recordBuyerGiveawayPurchaseEntries } from "@/lib/live-giveaway";

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

/** Refresh buyer Wallet default onto an order when ship-to placeholders are stale (including paid orders). */
export async function refreshBuyerShippingOnOrderIfIncomplete(
  orderId: string,
): Promise<
  { ok: true; updated: boolean } | { ok: false; code: "ORDER_NOT_FOUND" | "NO_SHIPPING_ADDRESS" }
> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      buyerAddressId: true,
      shipAddress: true,
      shipCity: true,
      shipState: true,
      shipZip: true,
      fulfillmentStatus: true,
      shippoTransactionId: true,
      labelUrl: true,
    },
  });
  if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
  if (!isIncompleteOrderShipping(order)) return { ok: true, updated: false };

  const shipping = await resolveBuyerDefaultShippingForOrder(order.buyerId);
  if (!shipping) return { ok: false, code: "NO_SHIPPING_ADDRESS" };

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
  return { ok: true, updated: true };
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.liveRoomItem.findFirst({
        where: {
          id: args.liveRoomItemId,
          liveRoomId: args.liveRoomId,
          status: "active",
          liveRoom: { sellerId: { not: args.buyerId }, status: "live", roomType: "sale" },
        },
        select: {
          id: true,
          title: true,
          listingId: true,
        },
      });
      if (!item?.listingId) throw Object.assign(new Error("LIVE_ITEM_INVALID"), { code: "LIVE_ITEM_INVALID" });

      const listingRow = await tx.listing.findUnique({
        where: { id: item.listingId },
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
      assertSellerStripeCollectReadyFromUser(listingRow.seller);

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
      if (existing && existing.buyerId !== args.buyerId) {
        throw Object.assign(new Error("CHECKOUT_IN_PROGRESS"), { code: "CHECKOUT_IN_PROGRESS" });
      }
      if (existing?.paymentStatus === PAYMENT_FAILED || existing?.paymentStatus === PAYMENT_PENDING) {
        await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
          listingId: listingRow.id,
          userId: existing.buyerId,
        });
        if (existing.paymentStatus === PAYMENT_FAILED || existing.paymentStatus === PAYMENT_PENDING) {
          await tx.order.delete({ where: { id: existing.id } });
        }
      }

      await reserveListingInventoryHoldTx(tx, {
        listingId: listingRow.id,
        userId: args.buyerId,
        source: "live_buy_now_saved_pm",
        liveRoomItemId: item.id,
      });

      const pmId = await getBuyerDefaultCardPaymentMethodId(args.buyerId);
      if (!pmId || !isStripePaymentMethodId(pmId)) {
        throw Object.assign(new Error("NO_SAVED_CARD"), { code: "NO_SAVED_CARD" });
      }

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
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "ORDER_CREATE_FAILED";
    const messages: Record<string, string> = {
      LIVE_ITEM_INVALID: "This item is not available to buy.",
      NOT_BUY_NOW: "This listing is not buy-now.",
      NOT_AVAILABLE: "This listing is not available.",
      OWN_LISTING: "You cannot buy your own listing.",
      SELLER_NOT_READY: "Seller payouts are not ready.",
      USE_ESCROW_CHECKOUT: "This purchase requires escrow checkout.",
      ALREADY_SOLD: "This item was already sold.",
      CHECKOUT_IN_PROGRESS: "Another buyer is checking out this item.",
      NO_SAVED_CARD: "Add a saved payment method to your Wallet.",
    };
    return { ok: false, code, error: messages[code] ?? "Could not start purchase." };
  }
}

export async function finalizeLiveBuyNowPurchaseComplete(args: {
  orderId: string;
  liveRoomId: string;
  liveRoomItemId: string;
  paymentIntentId?: string | null;
}): Promise<void> {
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
    await finalizeStripeMarketplaceOrderPaid(args.orderId, args.paymentIntentId ?? null, null);
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

  const titleShort =
    order.listing.title.length > 80 ? `${order.listing.title.slice(0, 77)}…` : order.listing.title;
  await createNotification(prisma, {
    userId: order.sellerId,
    type: "seller_ready_to_ship",
    title: "Live buy now — paid",
    body: `Payment received for "${titleShort}".`,
    href: `/orders/${encodeURIComponent(order.id)}`,
  });
}

export async function finalizeBreakSpotPaid(args: {
  breakSpotId: string;
  paymentIntentId?: string | null;
}): Promise<{ liveRoomId: string; buyerId: string; amountUsd: number; spotLabel: string } | null> {
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
        args.paymentIntentId ?? spotWithOrder.stripePaymentIntentId ?? null,
        null,
      );
    } catch (e) {
      console.error("[break spot] finalize fulfillment order failed", { breakSpotId: args.breakSpotId, e });
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

  await prisma.breakSpot.update({
    where: { id: spot.id },
    data: {
      claimStatus: "paid",
      paidAt: new Date(),
      breakPaymentStatus: PAYMENT_PAID,
      stripePaymentIntentId: args.paymentIntentId ?? undefined,
      stripeCheckoutSessionId: null,
    },
  });

  const { markBreakSpotExternalFulfillmentRequired } = await import(
    "@/services/shipping/break-pyt-fulfillment-bridge"
  );
  await markBreakSpotExternalFulfillmentRequired(spot.id);

  if (Number.isFinite(spot.priceUsd) && spot.priceUsd > 0) {
    await prisma.$transaction(async (tx) => {
      const { recordLiveShowCompletedSaleTx } = await import("@/lib/live-show-gmv");
      await recordLiveShowCompletedSaleTx(tx, spot.liveRoomId, spot.priceUsd);
    });
  }

  const { emitBreakSpotsChanged, emitLiveRoomMessagesRefetch } = await import("@/lib/realtime-emit-server");
  emitBreakSpotsChanged(spot.liveRoomId);
  emitLiveRoomMessagesRefetch(spot.liveRoomId);

  if (Number.isFinite(spot.priceUsd) && spot.priceUsd > 0) {
    const paymentNote = liveRoomBuyerPaymentConfirmedNotification({
      amountUsd: spot.priceUsd,
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
