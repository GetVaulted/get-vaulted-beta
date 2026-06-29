import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import {
  resolveBuyerDefaultShippingForOrder,
  syncBuyerDefaultShippingToPendingOrderTx,
} from "@/lib/live-buy-now-purchase";
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

function normalizeLiveRoomItemId(liveRoomItemId?: string | null): string | null {
  const trimmed = liveRoomItemId?.trim();
  return trimmed ? trimmed : null;
}

function liveCommerceSessionOpts(args: {
  liveShowId: string;
  liveRoomItemId?: string | null;
}): AddOrderToLiveShippingSessionOpts {
  return {
    liveShowId: args.liveShowId,
    liveRoomItemId: normalizeLiveRoomItemId(args.liveRoomItemId),
  };
}

/** Ensure live shipping session + immutable terms snapshot exist on a fulfillment order. */
/** Clear a half-settled live commerce order so shipping prep can run again on retry. */
async function repairStuckLiveCommerceOrderShippingTx(
  tx: TransactionClient,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      liveShippingSessionId: true,
      shippingTermsSnapshotJson: true,
    },
  });
  if (!order) return;
  const snapshotReady =
    order.shippingTermsSnapshotJson != null && typeof order.shippingTermsSnapshotJson === "object";
  if (snapshotReady) return;

  const sessionItem = await tx.liveShippingSessionItem.findUnique({
    where: { orderId },
    select: { sessionId: true },
  });
  if (sessionItem) {
    await tx.liveShippingSessionItem.delete({ where: { orderId } });
  }
  await tx.order.update({
    where: { id: orderId },
    data: { liveShippingSessionId: null },
  });
}

async function completeLiveCommerceFulfillmentShippingTx(
  tx: TransactionClient,
  orderId: string,
  itemPriceUsd: number,
  sessionOpts: AddOrderToLiveShippingSessionOpts,
  buyerId?: string,
): Promise<{ totalUsd: number; shippingPriceUsd: number }> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      buyerId: true,
      liveShippingSessionId: true,
      shippingTermsSnapshotJson: true,
      totalUsd: true,
      shippingPriceUsd: true,
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");

  await syncBuyerDefaultShippingToPendingOrderTx(tx, orderId, buyerId ?? order.buyerId);

  const shippingReady =
    order.liveShippingSessionId != null &&
    order.shippingTermsSnapshotJson != null &&
    typeof order.shippingTermsSnapshotJson === "object";

  if (!shippingReady) {
    try {
      await addOrderToLiveShippingSessionTx(tx, orderId, sessionOpts);
      const settled = await settleLiveOrderShippingTx(tx, orderId, sessionOpts);
      return {
        totalUsd: itemPriceUsd + settled.shippingPriceUsd,
        shippingPriceUsd: settled.shippingPriceUsd,
      };
    } catch {
      await repairStuckLiveCommerceOrderShippingTx(tx, orderId);
      await syncBuyerDefaultShippingToPendingOrderTx(tx, orderId, buyerId ?? order.buyerId);
      await addOrderToLiveShippingSessionTx(tx, orderId, sessionOpts);
      const settled = await settleLiveOrderShippingTx(tx, orderId, sessionOpts);
      return {
        totalUsd: itemPriceUsd + settled.shippingPriceUsd,
        shippingPriceUsd: settled.shippingPriceUsd,
      };
    }
  }

  return {
    totalUsd: order.totalUsd,
    shippingPriceUsd: order.shippingPriceUsd,
  };
}

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
    /** Charge spot/item price now; settle live bundled shipping after payment succeeds. */
    skipLiveShippingSettlement?: boolean;
  },
): Promise<{ orderId: string; totalUsd: number; shippingPriceUsd: number }> {
  const sessionOpts = liveCommerceSessionOpts({
    liveShowId: args.liveShowId,
    liveRoomItemId: args.liveRoomItemId,
  });

  const existingOrder = await tx.order.findFirst({
    where: { paymentLabel: args.idempotencyKey },
    select: {
      id: true,
      totalUsd: true,
      shippingPriceUsd: true,
      shippingTermsSnapshotJson: true,
      liveShippingSessionId: true,
    },
  });
  if (existingOrder) {
    if (args.skipLiveShippingSettlement) {
      await syncBuyerDefaultShippingToPendingOrderTx(tx, existingOrder.id, args.buyerId);
      return {
        orderId: existingOrder.id,
        totalUsd: args.itemPriceUsd,
        shippingPriceUsd: existingOrder.shippingPriceUsd ?? 0,
      };
    }
    const totals = await completeLiveCommerceFulfillmentShippingTx(
      tx,
      existingOrder.id,
      args.itemPriceUsd,
      sessionOpts,
    );
    return {
      orderId: existingOrder.id,
      totalUsd: totals.totalUsd,
      shippingPriceUsd: totals.shippingPriceUsd,
    };
  }

  const liveItem = normalizeLiveRoomItemId(args.liveRoomItemId)
    ? await tx.liveRoomItem.findFirst({
        where: {
          id: normalizeLiveRoomItemId(args.liveRoomItemId)!,
          liveRoomId: args.liveShowId,
        },
        select: { sellerShippingProfileId: true },
      })
    : null;

  const shipping = await resolveBuyerDefaultShippingForOrder(args.buyerId);
  if (!shipping) {
    throw new Error("NO_SHIPPING_ADDRESS");
  }

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

  if (args.skipLiveShippingSettlement) {
    return { orderId: order.id, totalUsd: args.itemPriceUsd, shippingPriceUsd: 0 };
  }

  const totals = await completeLiveCommerceFulfillmentShippingTx(
    tx,
    order.id,
    args.itemPriceUsd,
    sessionOpts,
  );

  return {
    orderId: order.id,
    totalUsd: totals.totalUsd,
    shippingPriceUsd: totals.shippingPriceUsd,
  };
}

export async function ensureVariantPurchaseFulfillmentOrder(
  purchaseId: string,
): Promise<{ orderId: string; chargeTotalUsd: number }> {
  try {
    return await ensureVariantPurchaseFulfillmentOrderStrict(purchaseId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err ?? "");
    console.error("[variant purchase] fulfillment strict path failed; charging spot price only", {
      purchaseId,
      detail,
    });
    try {
      return await ensureVariantPurchaseFulfillmentOrderSpotPriceFallback(purchaseId);
    } catch {
      throw err;
    }
  }
}

async function ensureVariantPurchaseFulfillmentOrderStrict(
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
        select: {
          id: true,
          totalUsd: true,
          shippingPriceUsd: true,
          liveShippingSessionId: true,
          shippingTermsSnapshotJson: true,
        },
      });
      if (order) {
        const sessionOpts = liveCommerceSessionOpts({
          liveShowId: purchase.liveRoomId,
          liveRoomItemId: purchase.liveRoomItemId,
        });
        const shippingReady =
          order.liveShippingSessionId != null &&
          order.shippingTermsSnapshotJson != null &&
          typeof order.shippingTermsSnapshotJson === "object";
        if (!shippingReady) {
          const totals = await completeLiveCommerceFulfillmentShippingTx(
            tx,
            order.id,
            purchase.totalUsd,
            sessionOpts,
          );
          return { orderId: order.id, chargeTotalUsd: totals.totalUsd };
        }
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

async function ensureVariantPurchaseFulfillmentOrderSpotPriceFallback(
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
      await syncBuyerDefaultShippingToPendingOrderTx(tx, purchase.fulfillmentOrderId, purchase.buyerId);
      await tx.order.update({
        where: { id: purchase.fulfillmentOrderId },
        data: { totalUsd: purchase.totalUsd, shippingPriceUsd: 0 },
      });
      return { orderId: purchase.fulfillmentOrderId, chargeTotalUsd: purchase.totalUsd };
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
      skipLiveShippingSettlement: true,
    });
    await tx.liveItemVariantPurchase.update({
      where: { id: purchase.id },
      data: { fulfillmentOrderId: created.orderId },
    });
    return { orderId: created.orderId, chargeTotalUsd: purchase.totalUsd };
  });
}

export async function ensureBreakSpotFulfillmentOrder(
  breakSpotId: string,
): Promise<{ orderId: string; chargeTotalUsd: number }> {
  try {
    return await ensureBreakSpotFulfillmentOrderStrict(breakSpotId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err ?? "");
    console.error("[break spot] fulfillment strict path failed; charging spot price only", {
      breakSpotId,
      detail,
    });
    try {
      return await ensureBreakSpotFulfillmentOrderSpotPriceFallback(breakSpotId);
    } catch {
      throw err;
    }
  }
}

async function ensureBreakSpotFulfillmentOrderStrict(
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
        select: {
          id: true,
          totalUsd: true,
          shippingPriceUsd: true,
          liveShippingSessionId: true,
          shippingTermsSnapshotJson: true,
        },
      });
      if (order) {
        const sessionOpts = liveCommerceSessionOpts({
          liveShowId: spot.liveRoomId,
          liveRoomItemId: spot.liveRoomItemId,
        });
        const shippingReady =
          order.liveShippingSessionId != null &&
          order.shippingTermsSnapshotJson != null &&
          typeof order.shippingTermsSnapshotJson === "object";
        if (!shippingReady) {
          const totals = await completeLiveCommerceFulfillmentShippingTx(
            tx,
            order.id,
            spot.priceUsd,
            sessionOpts,
          );
          return { orderId: order.id, chargeTotalUsd: totals.totalUsd };
        }
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

async function ensureBreakSpotFulfillmentOrderSpotPriceFallback(
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
      await syncBuyerDefaultShippingToPendingOrderTx(tx, spot.fulfillmentOrderId, spot.userId);
      await tx.order.update({
        where: { id: spot.fulfillmentOrderId },
        data: { totalUsd: spot.priceUsd, shippingPriceUsd: 0 },
      });
      return { orderId: spot.fulfillmentOrderId, chargeTotalUsd: spot.priceUsd };
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
      skipLiveShippingSettlement: true,
    });
    await tx.breakSpot.update({
      where: { id: spot.id },
      data: { fulfillmentOrderId: created.orderId },
    });
    return { orderId: created.orderId, chargeTotalUsd: spot.priceUsd };
  });
}
