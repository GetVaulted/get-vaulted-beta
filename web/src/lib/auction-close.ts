import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { createOrderFromAuctionWin } from "@/lib/offer-fulfillment";
import { prisma } from "@/lib/prisma";
import { resolveProxyAuction, type BidLike } from "@/lib/proxy-auction";
import { processAuctionPaymentExpiries } from "@/services/payments";

/**
 * If the listing is an expired auction, finalize: winner order + sold, or relist as buy-now when no bids.
 * Idempotent: safe to call multiple times.
 */
export async function closeAuctionIfDue(tx: TransactionClient, listingId: string): Promise<boolean> {
  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      buyingFormat: true,
      status: true,
      sellerId: true,
      shippingPriceUsd: true,
      shipFromAddressId: true,
      startingBidUsd: true,
      currentBidUsd: true,
      priceUsd: true,
      auctionEndsAt: true,
      title: true,
      moderationRemovedAt: true,
    },
  });

  if (!listing || listing.buyingFormat !== "auction") return false;
  if (listing.moderationRemovedAt) return false;
  if (listing.status !== "auction_live" && listing.status !== "active") return false;
  if (!listing.auctionEndsAt || listing.auctionEndsAt > new Date()) return false;

  const existingOrder = await tx.order.findUnique({
    where: { listingId },
    select: { id: true, paymentStatus: true },
  });
  if (existingOrder) {
    if (existingOrder.paymentStatus === "paid") {
      await tx.listing.update({ where: { id: listingId }, data: { status: "sold" } });
    } else if (existingOrder.paymentStatus !== "expired" && listing.buyingFormat === "auction") {
      await tx.listing.update({ where: { id: listingId }, data: { status: "awaiting_auction_payment" } });
    }
    return true;
  }

  const bidRows = await tx.bid.findMany({
    where: { listingId },
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

  if (bidRows.length > 0) {
    const startingHigh = listing.startingBidUsd ?? listing.priceUsd;
    const bidsLike: BidLike[] = bidRows.map((b) => ({
      bidderId: b.bidderId,
      amountUsd: b.amountUsd,
      maxBidUsd: b.maxBidUsd,
      createdAt: b.createdAt,
    }));
    const resolved = resolveProxyAuction(startingHigh, bidsLike);
    const leaderId = resolved.leaderBidderId!;
    const itemPriceUsd =
      listing.currentBidUsd != null && Number.isFinite(listing.currentBidUsd)
        ? listing.currentBidUsd
        : resolved.displayUsd;

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

    await createOrderFromAuctionWin(tx, {
      listingId: listing.id,
      listingTitle: listing.title,
      buyerId: leaderId,
      sellerId: listing.sellerId,
      itemPriceUsd,
      shippingPriceUsd: listing.shippingPriceUsd,
      sellerShipFromAddressId: listing.shipFromAddressId ?? null,
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
    });
    return true;
  }

  const start = listing.startingBidUsd ?? listing.priceUsd;
  await tx.listing.update({
    where: { id: listingId },
    data: {
      status: "active",
      buyingFormat: "buy_now",
      priceUsd: start,
      startingBidUsd: null,
      currentBidUsd: null,
      auctionEndsAt: null,
      auctionDurationDays: null,
    },
  });
  return true;
}

export async function closeAuctionIfDuePrisma(listingId: string): Promise<void> {
  await processAuctionPaymentExpiries();
  await prisma.$transaction(async (tx) => {
    await closeAuctionIfDue(tx, listingId);
  });
}
