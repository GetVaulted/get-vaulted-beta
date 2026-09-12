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
  try {
    // Default Prisma interactive-transaction timeout is 5s. The common case here is a single
    // read (listing isn't an expired auction), but a just-ended auction with bids does several
    // sequential writes (order + notifications) — under a brief DB hiccup (e.g. connection pool
    // still warming up after a restart) that can blow past 5s and throw, which — since this is
    // awaited directly from the listing page with no try/catch there — 500'd the entire page for
    // whoever was viewing that item. Give it real headroom, and since this work is explicitly
    // idempotent ("safe to call multiple times" above), swallow a failure here rather than crash
    // the page: the next page view (or the payment-expiry sweep) retries it.
    await prisma.$transaction(
      async (tx) => {
        await closeAuctionIfDue(tx, listingId);
      },
      { timeout: 15_000, maxWait: 8_000 },
    );
  } catch (e) {
    console.error("[closeAuctionIfDuePrisma] failed — will retry on next view", listingId, e);
  }
}
