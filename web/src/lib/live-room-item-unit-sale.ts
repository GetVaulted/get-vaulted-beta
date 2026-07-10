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
import { clearLiveAuctionProxyBidsForItem } from "@/lib/live-auction-pre-bid";

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

type LockedUnitSaleRow = {
  id: string;
  status: string;
  title: string;
  quantity: number;
  quantityInitial: number | null;
  listingId: string | null;
  currentBidUsd: number | null;
  startingBidUsd: number | null;
  priceUsd: number | null;
  lastHighBidderId: string | null;
};

/**
 * Close the current active unit on a multi- or single-unit lot: settle winner, decrement remaining
 * quantity, reset bid state for the next unit, or mark the row sold when exhausted.
 *
 * `FOR UPDATE` locks the row for the life of this transaction. Without it, two concurrent settle
 * calls (e.g. the overdue-sweep timer firing twice, or a manual "mark sold" racing the timer) can
 * both read `status: "active"` under READ COMMITTED before either commits, and both create a new
 * listing/order and charge the buyer for the same unit — a real double-charge, not just a
 * duplicate notification. The lock serializes them: the loser re-reads post-commit and sees
 * `status !== "active"`, so it cleanly no-ops instead of double-settling.
 */
export async function closeActiveLiveRoomItemUnitSale(
  tx: TransactionClient,
  args: CloseActiveUnitSaleArgs,
): Promise<CloseActiveUnitSaleResult> {
  const rows = await tx.$queryRaw<LockedUnitSaleRow[]>`
    SELECT
      id,
      status,
      title,
      quantity,
      "quantityInitial",
      "listingId",
      "currentBidUsd",
      "startingBidUsd",
      "priceUsd",
      "lastHighBidderId"
    FROM "LiveRoomItem"
    WHERE id = ${args.liveRoomItemId} AND "liveRoomId" = ${args.liveRoomId}
    FOR UPDATE
  `;
  const item = rows[0];
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
  // Live hold-to-bid stores maxProxyUsd on this same item row. If we keep those proxies,
  // the next unit's startAuction re-applies them and the prior winner auto-wins without bidding.
  await clearLiveAuctionProxyBidsForItem(tx, {
    liveRoomId: args.liveRoomId,
    itemId: item.id,
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
