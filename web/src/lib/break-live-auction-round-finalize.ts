import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { createOrderFromAuctionWin } from "@/lib/offer-fulfillment";
import { chargeLiveAuctionWinOrderWithBuyerDefaultSavedCard } from "@/lib/stripe-charge-order-saved-pm";

export type BreakRoundFinalizeResult = {
  /** True when a prior timed round was closed (winner sale and/or bid reset). */
  finalized: boolean;
  /** When the last unit sold, caller must not open a new timed window. */
  skipStartAuction: boolean;
  orderId?: string;
  /** When `createOrderFromAuctionWin` ran with deferred notifications, caller sends these after commit. */
  pendingWinNotifications?: {
    buyerId: string;
    sellerId: string;
    orderId: string;
    listingTitle: string;
    itemPriceUsd: number;
  };
};

/**
 * Break-room PYT tiles: when a timed round has ended and the host starts the next one, close the
 * previous round — create an `Order` for recent sales, decrement `quantity` by one on a winning
 * sale, reset the lot to $1 for the next round, and mark the queue row sold when quantity hits 0.
 *
 * Skips when the lot still has an attached marketplace `listingId` (multi-round + linked listing
 * is not auto-finalized here).
 */
export async function finalizeBreakAuctionRoundIfEnded(
  tx: TransactionClient,
  args: { liveRoomId: string; liveRoomItemId: string; sellerId: string },
): Promise<BreakRoundFinalizeResult> {
  const item = await tx.liveRoomItem.findFirst({
    where: { id: args.liveRoomItemId, liveRoomId: args.liveRoomId },
    select: {
      id: true,
      status: true,
      quantity: true,
      title: true,
      listingId: true,
      currentBidUsd: true,
      startingBidUsd: true,
      priceUsd: true,
      lastHighBidderId: true,
      biddingOpen: true,
      auctionEndsAt: true,
      itemVersion: true,
    },
  });
  if (!item || item.status !== "active") return { finalized: false, skipStartAuction: false };

  const now = new Date();
  const roundEnded =
    item.biddingOpen === true && item.auctionEndsAt != null && item.auctionEndsAt <= now;
  if (!roundEnded) return { finalized: false, skipStartAuction: false };

  if (item.listingId) {
    /** Linked-listing break bids need a manual / separate close path. */
    await tx.liveRoomItem.update({
      where: { id: item.id },
      data: {
        biddingOpen: false,
        auctionEndsAt: null,
        clutchTimeEnabled: false,
        currentBidUsd: null,
        startingBidUsd: 1,
        lastHighBidderId: null,
        itemVersion: { increment: 1 },
      },
    });
    await tx.liveRoom.update({
      where: { id: args.liveRoomId },
      data: { roomVersion: { increment: 1 } },
    });
    return { finalized: true, skipStartAuction: false };
  }

  const winnerId = item.lastHighBidderId?.trim();
  const winUsdRaw = item.currentBidUsd ?? item.startingBidUsd ?? item.priceUsd ?? 0;
  const winUsd = typeof winUsdRaw === "number" && Number.isFinite(winUsdRaw) ? winUsdRaw : 0;

  let orderId: string | undefined;
  let nextQty = item.quantity;
  let itemSold = false;

  if (winnerId && winUsd >= 1) {
    const listing = await tx.listing.create({
      data: {
        sellerId: args.sellerId,
        title: item.title.slice(0, 200) || "Live break",
        category: "Live break",
        condition: "See title",
        buyingFormat: "auction",
        status: "auction_live",
        priceUsd: winUsd,
        startingBidUsd: 1,
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
      listingTitle: item.title.slice(0, 200) || "Live break",
      buyerId: winnerId,
      sellerId: args.sellerId,
      itemPriceUsd: winUsd,
      shippingPriceUsd: 0,
      liveAuctionLiveShowId: args.liveRoomId,
      liveRoomItemId: args.liveRoomItemId,
      skipWinNotifications: true,
    });
    orderId = oid;
    nextQty = item.quantity - 1;
    itemSold = nextQty < 1;
  }

  await tx.liveRoomItem.update({
    where: { id: item.id },
    data: {
      quantity: itemSold ? 0 : Math.max(1, nextQty),
      status: itemSold ? "sold" : "active",
      listingId: null,
      currentBidUsd: null,
      startingBidUsd: 1,
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
    finalized: true,
    skipStartAuction: itemSold,
    orderId,
    pendingWinNotifications:
      orderId && winnerId && winUsd >= 1
        ? {
            buyerId: winnerId,
            sellerId: args.sellerId,
            orderId,
            listingTitle: item.title.slice(0, 200) || "Live break",
            itemPriceUsd: winUsd,
          }
        : undefined,
  };
}

/** Default auction-win copy (mirrors `createOrderFromAuctionWin` when `skipWinNotifications` was used). */
export async function sendBreakAuctionWinNotificationsDeferred(
  pending: NonNullable<BreakRoundFinalizeResult["pendingWinNotifications"]>,
): Promise<void> {
  const titleShort =
    pending.listingTitle.length > 80 ? `${pending.listingTitle.slice(0, 77)}…` : pending.listingTitle;
  const priceStr = pending.itemPriceUsd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const charge = await chargeLiveAuctionWinOrderWithBuyerDefaultSavedCard({
    buyerId: pending.buyerId,
    orderId: pending.orderId,
  });
  const paid = charge.outcome === "paid";
  const needsAuth = charge.outcome === "requires_action" || charge.outcome === "processing";

  const buyerBody = paid
    ? `You won “${titleShort}” at ${priceStr}. Your saved card was charged. Open your order for details.`
    : needsAuth
      ? `You won “${titleShort}” at ${priceStr}. Complete payment on your order — your bank may require an extra step.`
      : `You won “${titleShort}” at ${priceStr}. We could not charge your card automatically. Open your order and pay within 30 minutes.`;

  const sellerTitle = paid ? "Auction ended — paid" : "Auction ended — payment pending";
  const sellerBody = paid
    ? `Payment received for “${titleShort}”.`
    : needsAuth
      ? `The winner may need to complete authentication for “${titleShort}”.`
      : `Winner has 30 minutes to pay for “${titleShort}”. You will be notified when payment clears.`;

  await createNotification(prisma, {
    userId: pending.buyerId,
    type: "auction_won",
    title: "You won the auction",
    body: buyerBody,
    href: `/orders/${encodeURIComponent(pending.orderId)}`,
  });
  await createNotification(prisma, {
    userId: pending.sellerId,
    type: paid ? "item_sold" : "auction_pending_payment",
    title: sellerTitle,
    body: sellerBody,
    href: "/account/sales",
  });
}
