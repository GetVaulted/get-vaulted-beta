import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { resolveBuyerDefaultShippingForOrder } from "@/lib/live-buy-now-purchase";
import { resolveShippingProfileDimensions } from "@/lib/unified-shipping-engine";
import {
  addOrderToLiveShippingSessionTx,
  type AddOrderToLiveShippingSessionOpts,
} from "@/services/shipping/live-shipping-pricing";
import { settleLiveOrderShippingTx } from "@/services/shipping/live-commerce-shipping-settlement";
import { resolveBreakSpotSellerProfile, sellerShippingProfileToProfileInput } from "@/services/shipping/seller-shipping-profiles";
import { PAYMENT_PAID, PAYMENT_PENDING } from "@/services/payments";
import { prisma } from "@/lib/prisma";

export type LiveCommerceFulfillmentKind = "variant_purchase" | "break_spot";

/**
 * Creates a pending marketplace order for variant/break commerce so live shipping
 * ledger + immutable terms snapshot use the same path as auction / buy-now orders.
 */
export async function createLiveCommerceFulfillmentOrderTx(
  tx: TransactionClient,
  args: {
    kind: LiveCommerceFulfillmentKind;
    buyerId: string;
    sellerId: string;
    liveShowId: string;
    liveRoomItemId?: string | null;
    title: string;
    itemPriceUsd: number;
    idempotencyKey: string;
  },
): Promise<{ orderId: string; totalUsd: number; shippingPriceUsd: number }> {
  const existingOrder = await tx.order.findFirst({
    where: { paymentLabel: args.idempotencyKey },
    select: {
      id: true,
      totalUsd: true,
      shippingPriceUsd: true,
      shippingTermsSnapshotJson: true,
    },
  });
  if (existingOrder) {
    return {
      orderId: existingOrder.id,
      totalUsd: existingOrder.totalUsd,
      shippingPriceUsd: existingOrder.shippingPriceUsd,
    };
  }

  const shipping = await resolveBuyerDefaultShippingForOrder(args.buyerId);
  const seller = await tx.user.findUnique({
    where: { id: args.sellerId },
    select: { defaultShipFromAddressId: true },
  });

  const show = await tx.liveRoom.findFirst({
    where: { id: args.liveShowId, sellerId: args.sellerId },
    select: {
      defaultSellerShippingProfileId: true,
      defaultShippingProfileId: true,
      category: true,
    },
  });
  if (!show) throw new Error("LIVE_ROOM_NOT_FOUND");

  const liveItem = args.liveRoomItemId
    ? await tx.liveRoomItem.findFirst({
        where: { id: args.liveRoomItemId, liveRoomId: args.liveShowId },
        select: { sellerShippingProfileId: true },
      })
    : null;

  const breakProfile = await resolveBreakSpotSellerProfile({
    sellerId: args.sellerId,
    showDefaultSellerProfileId: show.defaultSellerShippingProfileId,
    itemSellerProfileId: liveItem?.sellerShippingProfileId ?? null,
    db: tx,
  });

  const dims = breakProfile
    ? resolveShippingProfileDimensions(sellerShippingProfileToProfileInput(breakProfile), null)
    : { weightOz: 4, lengthIn: 8, widthIn: 6, heightIn: 1 };

  const listing = await tx.listing.create({
    data: {
      sellerId: args.sellerId,
      title: args.title.slice(0, 200),
      description: args.title.slice(0, 4000),
      category: args.kind === "break_spot" ? "Break spot" : "Live spot",
      condition: "See title",
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: args.itemPriceUsd,
      shippingPriceUsd: 0,
      shippingCategory: "small_collectible",
      shippingBaseWeightOz: dims.weightOz,
      shippingIncrementalWeightOz: Math.max(1, Math.round(dims.weightOz * 0.25)),
      parcelWeightOz: dims.weightOz,
      parcelLengthIn: dims.lengthIn,
      parcelWidthIn: dims.widthIn,
      parcelHeightIn: dims.heightIn,
      shipFromAddressId: seller?.defaultShipFromAddressId ?? null,
    },
    select: { id: true },
  });

  const shipRecipientName = shipping?.shipRecipientName ?? "Buyer";
  const shipAddress = shipping?.shipAddress ?? "Coordinate shipping with the seller";
  const shipCity = shipping?.shipCity ?? "—";
  const shipState = shipping?.shipState ?? "—";
  const shipZip = shipping?.shipZip ?? "00000";
  const shipCountry = shipping?.shipCountry ?? "US";

  const order = await tx.order.create({
    data: {
      listingId: listing.id,
      buyerId: args.buyerId,
      sellerId: args.sellerId,
      itemPriceUsd: args.itemPriceUsd,
      shippingPriceUsd: 0,
      taxUsd: 0,
      totalUsd: args.itemPriceUsd,
      status: "pending",
      paymentStatus: PAYMENT_PENDING,
      fulfillmentStatus: "pending",
      paymentLabel: args.idempotencyKey,
      shipRecipientName,
      shipAddress,
      shipCity,
      shipState,
      shipZip,
      shipCountry,
      buyerAddressId: shipping?.buyerAddressId ?? null,
      sellerShipFromAddressId: seller?.defaultShipFromAddressId ?? null,
    },
    select: { id: true },
  });

  const sessionOpts: AddOrderToLiveShippingSessionOpts = {
    liveShowId: args.liveShowId,
    liveRoomItemId: args.liveRoomItemId ?? null,
  };
  await addOrderToLiveShippingSessionTx(tx, order.id, sessionOpts);
  const settled = await settleLiveOrderShippingTx(tx, order.id, sessionOpts);

  return {
    orderId: order.id,
    totalUsd: args.itemPriceUsd + settled.shippingPriceUsd,
    shippingPriceUsd: settled.shippingPriceUsd,
  };
}

export async function ensureVariantPurchaseFulfillmentOrder(
  purchaseId: string,
): Promise<{ orderId: string; chargeTotalUsd: number }> {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.liveItemVariantPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        liveRoomId: true,
        liveRoomItemId: true,
        buyerId: true,
        totalUsd: true,
        fulfillmentOrderId: true,
        variant: { select: { label: true } },
        liveRoom: { select: { sellerId: true } },
      },
    });
    if (!purchase) throw new Error("PURCHASE_NOT_FOUND");
    if (purchase.fulfillmentOrderId) {
      const order = await tx.order.findUnique({
        where: { id: purchase.fulfillmentOrderId },
        select: { totalUsd: true },
      });
      if (order) {
        return { orderId: purchase.fulfillmentOrderId, chargeTotalUsd: order.totalUsd };
      }
    }
    const title = `Live spot: ${purchase.variant.label}`.slice(0, 200);
    const created = await createLiveCommerceFulfillmentOrderTx(tx, {
      kind: "variant_purchase",
      buyerId: purchase.buyerId,
      sellerId: purchase.liveRoom.sellerId,
      liveShowId: purchase.liveRoomId,
      liveRoomItemId: purchase.liveRoomItemId,
      title,
      itemPriceUsd: purchase.totalUsd,
      idempotencyKey: `live_variant:${purchase.id}`,
    });
    await tx.liveItemVariantPurchase.update({
      where: { id: purchase.id },
      data: { fulfillmentOrderId: created.orderId },
    });
    return { orderId: created.orderId, chargeTotalUsd: created.totalUsd };
  });
}

export async function ensureBreakSpotFulfillmentOrder(
  breakSpotId: string,
): Promise<{ orderId: string; chargeTotalUsd: number }> {
  return prisma.$transaction(async (tx) => {
    const spot = await tx.breakSpot.findUnique({
      where: { id: breakSpotId },
      select: {
        id: true,
        liveRoomId: true,
        liveRoomItemId: true,
        userId: true,
        spotLabel: true,
        priceUsd: true,
        fulfillmentOrderId: true,
        liveRoom: { select: { sellerId: true } },
      },
    });
    if (!spot) throw new Error("SPOT_NOT_FOUND");
    if (spot.fulfillmentOrderId) {
      const order = await tx.order.findUnique({
        where: { id: spot.fulfillmentOrderId },
        select: { totalUsd: true },
      });
      if (order) {
        return { orderId: spot.fulfillmentOrderId, chargeTotalUsd: order.totalUsd };
      }
    }
    const title = `Break spot: ${spot.spotLabel}`.slice(0, 200);
    const created = await createLiveCommerceFulfillmentOrderTx(tx, {
      kind: "break_spot",
      buyerId: spot.userId,
      sellerId: spot.liveRoom.sellerId,
      liveShowId: spot.liveRoomId,
      liveRoomItemId: spot.liveRoomItemId,
      title,
      itemPriceUsd: spot.priceUsd,
      idempotencyKey: `live_break_spot:${spot.id}`,
    });
    await tx.breakSpot.update({
      where: { id: spot.id },
      data: { fulfillmentOrderId: created.orderId },
    });
    return { orderId: created.orderId, chargeTotalUsd: created.totalUsd };
  });
}
