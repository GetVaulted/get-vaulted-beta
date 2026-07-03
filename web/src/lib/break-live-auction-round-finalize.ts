import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { createNotification } from "@/lib/notifications";
import { recordPaymentFailureFromCharge } from "@/lib/live-room-payment-failure";
import { prisma } from "@/lib/prisma";
import { createOrderFromAuctionWin } from "@/lib/offer-fulfillment";
import { chargeLiveAuctionWinOrderWithBuyerDefaultSavedCard } from "@/lib/stripe-charge-order-saved-pm";
import {
  formatLiveQueueItemUnitTitle,
  normalizeQuantityInitial,
  resolveClosingUnitNumber,
} from "@/lib/live-room-item-quantity-display";

export type BreakRoundFinalizeResult = {
  /** True when a prior timed round was closed (winner sale and/or bid reset). */
  finalized: boolean;
  /** When the last unit sold, caller must not open a new timed window. */
  skipStartAuction: boolean;
  orderId?: string;
  soldUnitNumber?: number;
  /** When `createOrderFromAuctionWin` ran with deferred notifications, caller sends these after commit. */
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

type LockedBreakRoundRow = {
  id: string;
  status: string;
  quantity: number;
  quantityInitial: number | null;
  title: string;
  listingId: string | null;
  currentBidUsd: number | null;
  startingBidUsd: number | null;
  priceUsd: number | null;
  lastHighBidderId: string | null;
  biddingOpen: boolean;
  auctionEndsAt: Date | null;
};

/**
 * Break-room PYT tiles: when a timed round has ended and the host starts the next one, close the
 * previous round — create an `Order` for recent sales, decrement `quantity` by one on a winning
 * sale, reset the lot for the next numbered unit, and mark the queue row sold when quantity hits 0.
 *
 * This path (host "start next item") and the overdue-sweep timer path
 * (`closeActiveLiveRoomItemUnitSale`) both finalize the same kind of ended round and can fire at
 * nearly the same moment. `FOR UPDATE` serializes them against the same row: whichever runs
 * second re-reads fresh state after the winner is blocked/committed and bails out instead of
 * creating a second listing/order/charge for the same auction win.
 */
export async function finalizeBreakAuctionRoundIfEnded(
  tx: TransactionClient,
  args: { liveRoomId: string; liveRoomItemId: string; sellerId: string },
): Promise<BreakRoundFinalizeResult> {
  const rows = await tx.$queryRaw<LockedBreakRoundRow[]>`
    SELECT
      id, status, quantity, "quantityInitial", title, "listingId",
      "currentBidUsd", "startingBidUsd", "priceUsd", "lastHighBidderId",
      "biddingOpen", "auctionEndsAt"
    FROM "LiveRoomItem"
    WHERE id = ${args.liveRoomItemId} AND "liveRoomId" = ${args.liveRoomId}
    FOR UPDATE
  `;
  const item = rows[0];
  if (!item || item.status !== "active") return { finalized: false, skipStartAuction: false };

  const now = new Date();
  const roundEnded =
    item.biddingOpen === true && item.auctionEndsAt != null && item.auctionEndsAt <= now;
  if (!roundEnded) return { finalized: false, skipStartAuction: false };

  if (item.listingId) {
    /** Linked-listing break bids need a manual / separate close path. */
    const resetStart = item.startingBidUsd ?? item.priceUsd ?? 1;
    await tx.liveRoomItem.update({
      where: { id: item.id },
      data: {
        biddingOpen: false,
        auctionEndsAt: null,
        clutchTimeEnabled: false,
        currentBidUsd: null,
        startingBidUsd: resetStart,
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
  const totalQuantity = normalizeQuantityInitial(item);
  const soldUnitNumber = resolveClosingUnitNumber(item);
  const unitTitle =
    totalQuantity > 1 ? formatLiveQueueItemUnitTitle(item.title, soldUnitNumber) : item.title.slice(0, 200) || "Live break";

  let orderId: string | undefined;
  let nextQty = item.quantity;
  let itemSold = false;

  if (winnerId && winUsd >= 1) {
    const listing = await tx.listing.create({
      data: {
        sellerId: args.sellerId,
        title: unitTitle,
        category: "Live break",
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
      skipWinNotifications: true,
    });
    orderId = oid;
    nextQty = item.quantity - 1;
    itemSold = nextQty < 1;
  }

  const resetStart = item.startingBidUsd ?? item.priceUsd ?? 1;
  await tx.liveRoomItem.update({
    where: { id: item.id },
    data: {
      quantity: itemSold ? 0 : Math.max(1, nextQty),
      status: itemSold ? "sold" : "active",
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
    finalized: true,
    skipStartAuction: itemSold,
    orderId,
    soldUnitNumber: winnerId && winUsd >= 1 ? soldUnitNumber : undefined,
    pendingWinNotifications:
      orderId && winnerId && winUsd >= 1
        ? {
            buyerId: winnerId,
            sellerId: args.sellerId,
            orderId,
            listingTitle: unitTitle,
            itemPriceUsd: winUsd,
            liveRoomId: args.liveRoomId,
            liveRoomItemId: args.liveRoomItemId,
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
  const paymentFailed = charge.outcome === "error";
  const needsAuth = charge.outcome === "requires_action" || charge.outcome === "processing";

  if (!paid) {
    await recordPaymentFailureFromCharge({
      liveRoomId: pending.liveRoomId,
      buyerId: pending.buyerId,
      kind: "auction_win",
      liveRoomItemId: pending.liveRoomItemId,
      orderId: pending.orderId,
      amountUsd: pending.itemPriceUsd,
      itemTitle: pending.listingTitle,
      charge,
    });
  }

  const buyerBody = paid
    ? `You won “${titleShort}” at ${priceStr}. Your saved card was charged. Open your order for details.`
    : needsAuth
      ? `You won “${titleShort}” at ${priceStr}. Complete payment in the show — your bank may require an extra step.`
      : `You won “${titleShort}” at ${priceStr}. We could not charge your card. Update your payment method in the show before the host continues.`;

  const sellerTitle = paid ? "Auction ended — paid" : paymentFailed ? "Auction ended — payment failed" : "Auction ended — payment pending";
  const sellerBody = paid
    ? `Payment received for "${titleShort}".`
    : paymentFailed
      ? `Payment failed for @${(
          await prisma.user.findUnique({ where: { id: pending.buyerId }, select: { username: true } })
        )?.username ?? "buyer"} on "${titleShort}" — ${priceStr}. They must update payment before you start the next lot.`
      : needsAuth
      ? `The winner may need to complete authentication for “${titleShort}”.`
      : `Winner must update payment for “${titleShort}” before the show continues.`;

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
