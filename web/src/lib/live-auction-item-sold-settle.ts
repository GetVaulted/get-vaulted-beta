import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { createOrderFromAuctionWin } from "@/lib/offer-fulfillment";
import { resolveProxyAuction, type BidLike } from "@/lib/proxy-auction";
import { roundUsd } from "@/lib/round-usd";
import { captureLiveRoomItemShippingSnapshotTx } from "@/services/shipping/live-item-shipping-snapshot";

/** Hammer price for a live lot — live room high bid wins over listing/proxy snapshots. */
export function resolveLiveAuctionHammerUsd(args: {
  liveRoomItemHighUsd: number | null | undefined;
  listingCurrentBidUsd: number | null | undefined;
  proxyDisplayUsd: number;
}): number {
  const liveHigh = args.liveRoomItemHighUsd;
  if (typeof liveHigh === "number" && Number.isFinite(liveHigh) && liveHigh > 0) {
    return roundUsd(liveHigh);
  }
  if (
    args.listingCurrentBidUsd != null &&
    Number.isFinite(args.listingCurrentBidUsd) &&
    args.listingCurrentBidUsd > 0
  ) {
    return roundUsd(args.listingCurrentBidUsd);
  }
  return roundUsd(args.proxyDisplayUsd);
}

/**
 * When a host marks a live auction queue item sold, ensure a marketplace `Order` exists
 * (same economics as time-based auction close, plus scoped live shipping session).
 */
export async function settleLiveAuctionItemWhenMarkedSold(
  tx: TransactionClient,
  args: {
    liveRoomId: string;
    liveRoomItemId: string;
    skipWinNotifications?: boolean;
    /** When set, used for the generated listing / order title (numbered multi-unit lots). */
    unitListingTitle?: string;
  },
): Promise<{ orderId: string; buyerId: string; listingTitle: string; itemPriceUsd: number; sellerId: string }> {
  const room = await tx.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: { id: true, sellerId: true, roomType: true },
  });
  if (!room || room.roomType !== "auction") {
    throw new Error("LIVE_AUCTION_SETTLE_NOT_AUCTION_ROOM");
  }

  const item = await tx.liveRoomItem.findFirst({
    where: { id: args.liveRoomItemId, liveRoomId: args.liveRoomId },
    select: {
      id: true,
      listingId: true,
      title: true,
      currentBidUsd: true,
      startingBidUsd: true,
      priceUsd: true,
      lastHighBidderId: true,
    },
  });
  if (!item) throw new Error("LIVE_AUCTION_ITEM_NOT_FOUND");

  await captureLiveRoomItemShippingSnapshotTx(tx, args.liveRoomItemId);

  let listingId = item.listingId;

  if (!listingId) {
    const winnerId = item.lastHighBidderId?.trim();
    const high = item.currentBidUsd ?? item.startingBidUsd ?? item.priceUsd ?? 0;
    if (!winnerId || !Number.isFinite(high) || high <= 0) {
      throw new Error("LIVE_AUCTION_NO_WINNER");
    }
    const listing = await tx.listing.create({
      data: {
        sellerId: room.sellerId,
        title: (args.unitListingTitle ?? item.title).slice(0, 200) || "Live auction",
        category: "Live auction",
        condition: "See title",
        buyingFormat: "auction",
        status: "auction_live",
        priceUsd: high,
        startingBidUsd: item.startingBidUsd ?? item.priceUsd ?? high,
        currentBidUsd: high,
        auctionEndsAt: new Date(0),
        shippingPriceUsd: 0,
      },
      select: { id: true },
    });
    listingId = listing.id;
    await tx.liveRoomItem.update({
      where: { id: item.id },
      data: { listingId },
    });
    await tx.bid.create({
      data: {
        listingId,
        bidderId: winnerId,
        amountUsd: high,
        maxBidUsd: high,
      },
    });
  }

  const listingRow = await tx.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      sellerId: true,
      shippingPriceUsd: true,
      shipFromAddressId: true,
      startingBidUsd: true,
      currentBidUsd: true,
      priceUsd: true,
      moderationRemovedAt: true,
    },
  });
  if (!listingRow || listingRow.moderationRemovedAt) {
    throw new Error("LISTING_NOT_AVAILABLE");
  }

  // Multi-qty lots stamp `unitListingTitle` ("PYT Break 1 #3") at close — keep listing,
  // order, and the broadcast celebration on that exact string even when a listing already existed.
  const listingTitle =
    (args.unitListingTitle?.trim() || listingRow.title).slice(0, 200) || "Live auction";
  if (listingTitle !== listingRow.title) {
    await tx.listing.update({
      where: { id: listingRow.id },
      data: { title: listingTitle },
    });
  }

  const bidRows = await tx.bid.findMany({
    where: { listingId: listingRow.id },
    orderBy: { createdAt: "asc" },
    select: {
      bidderId: true,
      amountUsd: true,
      maxBidUsd: true,
      createdAt: true,
      shipRecipientName: true,
      shipAddress: true,
      shipCity: true,
      shipState: true,
      shipZip: true,
      shipCountry: true,
      paymentLabel: true,
    },
  });
  if (bidRows.length === 0) {
    throw new Error("LIVE_AUCTION_NO_WINNER");
  }

  const startingHigh = listingRow.startingBidUsd ?? listingRow.priceUsd;
  const bidsLike: BidLike[] = bidRows.map((b) => ({
    bidderId: b.bidderId,
    amountUsd: b.amountUsd,
    maxBidUsd: b.maxBidUsd,
    createdAt: b.createdAt,
  }));
  const resolved = resolveProxyAuction(startingHigh, bidsLike);
  const leaderId = resolved.leaderBidderId;
  if (!leaderId) {
    throw new Error("LIVE_AUCTION_NO_WINNER");
  }

  const itemPriceUsd = resolveLiveAuctionHammerUsd({
    liveRoomItemHighUsd: item.currentBidUsd,
    listingCurrentBidUsd: listingRow.currentBidUsd,
    proxyDisplayUsd: resolved.displayUsd,
  });

  const leaderBids = bidRows.filter((b) => b.bidderId === leaderId);
  const winCheckout = [...leaderBids].reverse().find(
    (b) =>
      b.shipRecipientName &&
      b.shipAddress &&
      b.shipCity &&
      b.shipState &&
      b.shipZip &&
      b.shipCountry &&
      b.paymentLabel,
  );

  const order = await createOrderFromAuctionWin(tx, {
    listingId: listingRow.id,
    listingTitle,
    buyerId: leaderId,
    sellerId: listingRow.sellerId,
    itemPriceUsd,
    skipWinNotifications: args.skipWinNotifications,
    shippingPriceUsd: listingRow.shippingPriceUsd,
    sellerShipFromAddressId: listingRow.shipFromAddressId ?? null,
    ...(winCheckout
      ? {
          shipRecipientName: winCheckout.shipRecipientName!,
          shipAddress: winCheckout.shipAddress!,
          shipCity: winCheckout.shipCity!,
          shipState: winCheckout.shipState!,
          shipZip: winCheckout.shipZip!,
          shipCountry: winCheckout.shipCountry!,
          paymentLabel: winCheckout.paymentLabel!,
        }
      : {}),
    liveAuctionLiveShowId: args.liveRoomId,
    liveRoomItemId: args.liveRoomItemId,
  });
  return {
    orderId: order.orderId,
    buyerId: leaderId,
    listingTitle,
    itemPriceUsd,
    sellerId: listingRow.sellerId,
  };
}
