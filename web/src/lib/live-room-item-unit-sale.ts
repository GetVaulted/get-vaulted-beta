import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import type { LiveRoomType } from "@/generated/prisma/client";
import {
  formatLiveQueueItemUnitTitle,
  normalizeQuantityInitial,
  resolveClosingUnitNumber,
} from "@/lib/live-room-item-quantity-display";
import { settleLiveAuctionItemWhenMarkedSold } from "@/lib/live-auction-item-sold-settle";
import { createOrderFromAuctionWin } from "@/lib/offer-fulfillment";
import { captureLiveRoomItemShippingSnapshotTx } from "@/services/shipping/live-item-shipping-snapshot";

export type CloseActiveUnitSaleResult = {
  closed: boolean;
  itemSoldOut: boolean;
  skipStartAuction: boolean;
  soldUnitNumber: number;
  orderId?: string;
  buyerId?: string;
  sellerId?: string;
  listingTitle?: string;
  itemPriceUsd?: number;
  pendingWinNotifications?: {
    buyerId: string;
    sellerId: string;
    orderId: string;
    listingTitle: string;
    itemPriceUsd: number;
    liveRoomId: string;
    liveRoomItemId: string;
  };
};

type CloseActiveUnitSaleArgs = {
  liveRoomId: string;
  liveRoomItemId: string;
  sellerId: string;
  roomType: LiveRoomType;
  skipWinNotifications?: boolean;
};

/**
 * Close the current active unit on a multi- or single-unit lot: settle winner, decrement remaining
 * quantity, reset bid state for the next unit, or mark the row sold when exhausted.
 */
export async function closeActiveLiveRoomItemUnitSale(
  tx: TransactionClient,
  args: CloseActiveUnitSaleArgs,
): Promise<CloseActiveUnitSaleResult> {
  const item = await tx.liveRoomItem.findFirst({
    where: { id: args.liveRoomItemId, liveRoomId: args.liveRoomId },
    select: {
      id: true,
      status: true,
      title: true,
      quantity: true,
      quantityInitial: true,
      listingId: true,
      currentBidUsd: true,
      startingBidUsd: true,
      priceUsd: true,
      lastHighBidderId: true,
    },
  });
  if (!item || item.status !== "active") {
    return { closed: false, itemSoldOut: false, skipStartAuction: false, soldUnitNumber: 0 };
  }

  const totalQuantity = normalizeQuantityInitial(item);
  const soldUnitNumber = resolveClosingUnitNumber(item);
  const unitTitle =
    totalQuantity > 1 ? formatLiveQueueItemUnitTitle(item.title, soldUnitNumber) : item.title.slice(0, 200) || "Live item";

  const winnerId = item.lastHighBidderId?.trim();
  const winUsdRaw = item.currentBidUsd ?? item.startingBidUsd ?? item.priceUsd ?? 0;
  const winUsd = typeof winUsdRaw === "number" && Number.isFinite(winUsdRaw) ? winUsdRaw : 0;

  let orderId: string | undefined;
  let buyerId: string | undefined;
  let sellerId: string | undefined;
  let listingTitle: string | undefined;
  let itemPriceUsd: number | undefined;
  let pendingWinNotifications: CloseActiveUnitSaleResult["pendingWinNotifications"];

  if (args.roomType === "auction") {
    if (!winnerId || winUsd < 1) {
      return { closed: false, itemSoldOut: false, skipStartAuction: false, soldUnitNumber };
    }
    await captureLiveRoomItemShippingSnapshotTx(tx, args.liveRoomItemId);
    const settleOut = await settleLiveAuctionItemWhenMarkedSold(tx, {
      liveRoomId: args.liveRoomId,
      liveRoomItemId: args.liveRoomItemId,
      skipWinNotifications: args.skipWinNotifications ?? true,
      unitListingTitle: unitTitle,
    });
    orderId = settleOut.orderId;
    buyerId = settleOut.buyerId;
    sellerId = settleOut.sellerId;
    listingTitle = settleOut.listingTitle;
    itemPriceUsd = settleOut.itemPriceUsd;
  } else if (winnerId && winUsd >= 1 && !item.listingId) {
    const listing = await tx.listing.create({
      data: {
        sellerId: args.sellerId,
        title: unitTitle,
        category: args.roomType === "break" ? "Live break" : "Live sale",
        condition: "See title",
        buyingFormat: "auction",
        status: "auction_live",
        priceUsd: winUsd,
        startingBidUsd: item.startingBidUsd ?? item.priceUsd ?? 1,
        currentBidUsd: winUsd,
        auctionEndsAt: new Date(0),
        shippingPriceUsd: 0,
      },
      select: { id: true },
    });
    await tx.bid.create({
      data: {
        listingId: listing.id,
        bidderId: winnerId,
        amountUsd: winUsd,
        maxBidUsd: winUsd,
      },
    });
    const { orderId: oid } = await createOrderFromAuctionWin(tx, {
      listingId: listing.id,
      listingTitle: unitTitle,
      buyerId: winnerId,
      sellerId: args.sellerId,
      itemPriceUsd: winUsd,
      shippingPriceUsd: 0,
      liveAuctionLiveShowId: args.liveRoomId,
      liveRoomItemId: args.liveRoomItemId,
      skipWinNotifications: args.skipWinNotifications ?? true,
    });
    orderId = oid;
    buyerId = winnerId;
    sellerId = args.sellerId;
    listingTitle = unitTitle;
    itemPriceUsd = winUsd;
    if (args.skipWinNotifications) {
      pendingWinNotifications = {
        buyerId: winnerId,
        sellerId: args.sellerId,
        orderId: oid,
        listingTitle: unitTitle,
        itemPriceUsd: winUsd,
        liveRoomId: args.liveRoomId,
        liveRoomItemId: args.liveRoomItemId,
      };
    }
  }

  const nextRemaining = Math.max(0, item.quantity - 1);
  const itemSoldOut = totalQuantity <= 1 || nextRemaining < 1;
  const resetStart = item.startingBidUsd ?? item.priceUsd ?? 1;

  await tx.liveRoomItem.update({
    where: { id: item.id },
    data: {
      quantity: itemSoldOut ? 0 : nextRemaining,
      status: itemSoldOut ? "sold" : "active",
      listingId: null,
      currentBidUsd: null,
      startingBidUsd: resetStart,
      lastHighBidderId: null,
      biddingOpen: false,
      auctionEndsAt: null,
      clutchTimeEnabled: false,
      itemVersion: { increment: 1 },
    },
  });
  await tx.liveRoom.update({
    where: { id: args.liveRoomId },
    data: { roomVersion: { increment: 1 } },
  });

  return {
    closed: true,
    itemSoldOut,
    skipStartAuction: itemSoldOut,
    soldUnitNumber,
    orderId,
    buyerId,
    sellerId,
    listingTitle,
    itemPriceUsd,
    pendingWinNotifications,
  };
}
