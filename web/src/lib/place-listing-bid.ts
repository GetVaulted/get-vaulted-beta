import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { minNextBidUsd } from "@/lib/auction";
import { closeAuctionIfDue } from "@/lib/auction-close";
import { resolveProxyAuction, type BidLike } from "@/lib/proxy-auction";
import { getTransactionServerNow } from "@/lib/server-transaction-now";

/** Ship + payment snapshot saved on the bid (marketplace); used when this bidder wins. */
export type AuctionBidCheckoutSnapshot = {
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  /** Stripe PaymentMethod id (`pm_…`); persisted on `Bid.paymentLabel` until a dedicated column exists. */
  paymentLabel: string;
  buyerAddressId?: string | null;
};

export type PlaceListingBidResult = {
  listingTitle: string;
  /** Previous winning bidder id (before this bid), if any */
  prevLeaderId: string | null;
  /** New public auction price after this bid */
  amountUsd: number;
  /** Winning bidder after this bid */
  leaderBidderId: string | null;
  /** True if the bidder who placed this bid is the current leader */
  youAreLeader: boolean;
};

/**
 * Places a proxy (max) bid on a listing. `maxBidUsd` is the most the bidder is willing to pay;
 * the stored row `amountUsd` is the new public price after resolution.
 */
export async function placeListingProxyBid(
  tx: TransactionClient,
  args: { listingId: string; bidderId: string; maxBidUsd: number; checkout?: AuctionBidCheckoutSnapshot },
): Promise<PlaceListingBidResult> {
  const { listingId, bidderId, maxBidUsd, checkout } = args;

  await closeAuctionIfDue(tx, listingId);

  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      sellerId: true,
      buyingFormat: true,
      status: true,
      startingBidUsd: true,
      currentBidUsd: true,
      priceUsd: true,
      auctionEndsAt: true,
      moderationRemovedAt: true,
    },
  });

  if (!listing) {
    throw new Error("NOT_FOUND");
  }
  if (listing.moderationRemovedAt) {
    throw new Error("NOT_OPEN");
  }
  if (listing.buyingFormat !== "auction") {
    throw new Error("NOT_AUCTION");
  }
  if (listing.status !== "auction_live" && listing.status !== "active") {
    throw new Error("NOT_OPEN");
  }
  if (listing.sellerId === bidderId) {
    throw new Error("OWN_LISTING");
  }

  const now = await getTransactionServerNow(tx);
  if (listing.auctionEndsAt && listing.auctionEndsAt <= now) {
    throw new Error("ENDED");
  }

  const startingHigh = listing.startingBidUsd ?? listing.priceUsd;
  const displayHigh = listing.currentBidUsd ?? startingHigh;
  const minRequired = minNextBidUsd(displayHigh);
  if (maxBidUsd < minRequired) {
    throw new Error(`MIN_BID:${minRequired}`);
  }

  const existing = await tx.bid.findMany({
    where: { listingId },
    select: { bidderId: true, amountUsd: true, maxBidUsd: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const bidsLike: BidLike[] = existing.map((b) => ({
    bidderId: b.bidderId,
    amountUsd: b.amountUsd,
    maxBidUsd: b.maxBidUsd,
    createdAt: b.createdAt,
  }));

  const oldResolved = resolveProxyAuction(startingHigh, bidsLike);

  const provisional: BidLike = {
    bidderId,
    amountUsd: maxBidUsd,
    maxBidUsd,
    createdAt: now,
  };
  const newResolved = resolveProxyAuction(startingHigh, [...bidsLike, provisional]);

  await tx.bid.create({
    data: {
      listingId,
      bidderId,
      amountUsd: newResolved.displayUsd,
      maxBidUsd,
      ...(checkout
        ? {
            shipRecipientName: checkout.shipRecipientName,
            shipAddress: checkout.shipAddress,
            shipCity: checkout.shipCity,
            shipState: checkout.shipState,
            shipZip: checkout.shipZip,
            shipCountry: checkout.shipCountry,
            paymentLabel: checkout.paymentLabel,
          }
        : {}),
    },
  });

  await tx.listing.update({
    where: { id: listingId },
    data: { currentBidUsd: newResolved.displayUsd },
  });

  await closeAuctionIfDue(tx, listingId);

  const prevLeaderId =
    oldResolved.leaderBidderId && newResolved.leaderBidderId !== oldResolved.leaderBidderId
      ? oldResolved.leaderBidderId
      : null;

  return {
    listingTitle: listing.title,
    prevLeaderId,
    amountUsd: newResolved.displayUsd,
    leaderBidderId: newResolved.leaderBidderId,
    youAreLeader: newResolved.leaderBidderId === bidderId,
  };
}

/** @deprecated name — use {@link placeListingProxyBid}; kept for call sites passing a fixed amount as max. */
export async function placeListingBid(
  tx: TransactionClient,
  args: { listingId: string; bidderId: string; amountUsd: number },
): Promise<PlaceListingBidResult> {
  return placeListingProxyBid(tx, { ...args, maxBidUsd: args.amountUsd });
}

/**
 * Live-room bid on a linked marketplace listing (Whatnot-style).
 * `amountUsd` becomes the public hammer immediately — Exact jumps and min-next floors alike.
 * Standalone marketplace auctions keep using {@link placeListingProxyBid}.
 *
 * **Clock of record:** `LiveRoomItem.biddingOpen` / `auctionEndsAt` (validated by
 * `lockActiveLiveRoomItemForBid` before this runs). Do **not** call `closeAuctionIfDue` or
 * reject on `Listing.auctionEndsAt` here — shop listings often carry a stale marketplace end
 * time, which made Hold-to-Bid flash "you're winning" then snap back when the listing clock
 * falsely closed the auction mid-show.
 */
export async function placeLiveListingBid(
  tx: TransactionClient,
  args: { listingId: string; bidderId: string; amountUsd: number },
): Promise<PlaceListingBidResult> {
  const { listingId, bidderId, amountUsd } = args;

  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      sellerId: true,
      buyingFormat: true,
      status: true,
      startingBidUsd: true,
      currentBidUsd: true,
      priceUsd: true,
      moderationRemovedAt: true,
    },
  });

  if (!listing) {
    throw new Error("NOT_FOUND");
  }
  if (listing.moderationRemovedAt) {
    throw new Error("NOT_OPEN");
  }
  if (listing.buyingFormat !== "auction") {
    throw new Error("NOT_AUCTION");
  }
  if (listing.status !== "auction_live" && listing.status !== "active") {
    throw new Error("NOT_OPEN");
  }
  if (listing.sellerId === bidderId) {
    throw new Error("OWN_LISTING");
  }

  if (!Number.isFinite(amountUsd) || amountUsd < 1) {
    throw new Error("MIN_BID:1");
  }

  const startingHigh = listing.startingBidUsd ?? listing.priceUsd;
  const displayHigh = listing.currentBidUsd ?? startingHigh;
  const existing = await tx.bid.findMany({
    where: { listingId },
    select: { bidderId: true, amountUsd: true, maxBidUsd: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const bidsLike: BidLike[] = existing.map((b) => ({
    bidderId: b.bidderId,
    amountUsd: b.amountUsd,
    maxBidUsd: b.maxBidUsd,
    createdAt: b.createdAt,
  }));
  const oldResolved = resolveProxyAuction(startingHigh, bidsLike);

  // First live bid may equal opening; later bids must beat the public high.
  if (existing.length > 0 || listing.currentBidUsd != null) {
    if (amountUsd <= displayHigh + 0.001) {
      throw new Error(`MIN_BID:${minNextBidUsd(displayHigh)}`);
    }
  } else if (amountUsd + 0.001 < startingHigh) {
    throw new Error(`MIN_BID:${startingHigh}`);
  }

  await tx.bid.create({
    data: {
      listingId,
      bidderId,
      amountUsd,
      maxBidUsd: amountUsd,
    },
  });

  await tx.listing.update({
    where: { id: listingId },
    data: { currentBidUsd: amountUsd, status: "auction_live" },
  });

  const prevLeaderId =
    oldResolved.leaderBidderId && oldResolved.leaderBidderId !== bidderId
      ? oldResolved.leaderBidderId
      : null;

  return {
    listingTitle: listing.title,
    prevLeaderId,
    amountUsd,
    leaderBidderId: bidderId,
    youAreLeader: true,
  };
}
