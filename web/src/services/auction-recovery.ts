import { computeAuctionEndsAt, defaultAuctionDurationDays } from "@/lib/auction";
import { releaseActiveInventoryHoldsForListingAndBuyerTx } from "@/lib/live-auction-inventory-hold";
import { createOrderFromAuctionWin } from "@/lib/offer-fulfillment";
import { prisma } from "@/lib/prisma";
import type { BidLike } from "@/lib/proxy-auction";
import { resolveProxyAuction } from "@/lib/proxy-auction";
import { SELLER_COMMERCE_KIND, logSellerCommerceEvent } from "@/lib/seller-commerce-event";
import { assertSellerCanPublishListing } from "@/lib/seller-publish-readiness";
import { PAYMENT_EXPIRED, processAuctionPaymentExpiries } from "@/services/payments";

async function assertSellerOrAdmin(listingId: string, actorUserId: string, actorIsAdmin: boolean) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, sellerId: true, moderationRemovedAt: true },
  });
  if (!listing || listing.moderationRemovedAt) throw new Error("NOT_FOUND");
  if (!actorIsAdmin && listing.sellerId !== actorUserId) throw new Error("FORBIDDEN");
  return listing;
}

export type OfferNextBidderPreview = {
  backupBidderUsername: string;
  hammerPriceUsd: number;
  paymentWindowMinutes: number;
};

/** Read-only: who would win next and at what price (same rules as `offerAuctionToNextBidder`). */
export async function getOfferNextBidderPreview(args: {
  listingId: string;
  actorUserId: string;
  actorIsAdmin: boolean;
}): Promise<OfferNextBidderPreview> {
  await processAuctionPaymentExpiries();
  await assertSellerOrAdmin(args.listingId, args.actorUserId, args.actorIsAdmin);

  const listingRow = await prisma.listing.findUnique({
    where: { id: args.listingId },
    select: { id: true, status: true, buyingFormat: true, startingBidUsd: true, priceUsd: true },
  });
  if (!listingRow) throw new Error("NOT_FOUND");
  if (listingRow.status !== "auction_ended_unpaid" || listingRow.buyingFormat !== "auction") {
    throw new Error("INVALID_STATUS");
  }

  const order = await prisma.order.findUnique({
    where: { listingId: args.listingId },
    select: { buyerId: true, paymentStatus: true },
  });
  if (!order || order.paymentStatus !== PAYMENT_EXPIRED) throw new Error("INVALID_STATUS");

  const bidRows = await prisma.bid.findMany({
    where: { listingId: args.listingId },
    orderBy: { createdAt: "asc" },
    select: {
      bidderId: true,
      amountUsd: true,
      maxBidUsd: true,
      createdAt: true,
    },
  });

  const filtered = bidRows.filter((b) => b.bidderId !== order.buyerId);
  if (filtered.length === 0) throw new Error("NO_BACKUP_BIDDER");

  const bidsLike: BidLike[] = filtered.map((b) => ({
    bidderId: b.bidderId,
    amountUsd: b.amountUsd,
    maxBidUsd: b.maxBidUsd,
    createdAt: b.createdAt,
  }));
  const startingHigh = listingRow.startingBidUsd ?? listingRow.priceUsd;
  const resolved = resolveProxyAuction(startingHigh, bidsLike);
  if (!resolved.leaderBidderId) throw new Error("NO_BACKUP_BIDDER");

  const user = await prisma.user.findUnique({
    where: { id: resolved.leaderBidderId },
    select: { username: true },
  });
  if (!user) throw new Error("NO_BACKUP_BIDDER");

  return {
    backupBidderUsername: user.username,
    hammerPriceUsd: resolved.displayUsd,
    paymentWindowMinutes: 30,
  };
}

/**
 * After the winning buyer’s payment expired: offer the item to the next-highest eligible bidder
 * (same proxy resolution, excluding the non-paying winner). Deletes the expired order and creates
 * a fresh pending checkout order with a new 30-minute deadline.
 */
export async function offerAuctionToNextBidder(args: {
  listingId: string;
  actorUserId: string;
  actorIsAdmin: boolean;
}): Promise<{ orderId: string }> {
  await processAuctionPaymentExpiries();
  const { sellerId } = await assertSellerOrAdmin(args.listingId, args.actorUserId, args.actorIsAdmin);

  const listingRow = await prisma.listing.findUnique({
    where: { id: args.listingId },
    select: {
      id: true,
      sellerId: true,
      status: true,
      buyingFormat: true,
      title: true,
      shippingPriceUsd: true,
      shipFromAddressId: true,
      startingBidUsd: true,
      priceUsd: true,
      auctionDurationDays: true,
    },
  });
  if (!listingRow) throw new Error("NOT_FOUND");
  if (listingRow.status !== "auction_ended_unpaid" || listingRow.buyingFormat !== "auction") {
    throw new Error("INVALID_STATUS");
  }

  const result = await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { id: args.listingId },
      select: {
        id: true,
        sellerId: true,
        status: true,
        buyingFormat: true,
        title: true,
        shippingPriceUsd: true,
        shipFromAddressId: true,
        startingBidUsd: true,
        priceUsd: true,
      },
    });
    if (!listing || listing.status !== "auction_ended_unpaid") throw new Error("INVALID_STATUS");

    const order = await tx.order.findUnique({
      where: { listingId: args.listingId },
      select: { id: true, buyerId: true, paymentStatus: true },
    });
    if (!order || order.paymentStatus !== PAYMENT_EXPIRED) throw new Error("INVALID_STATUS");

    const bidRows = await tx.bid.findMany({
      where: { listingId: args.listingId },
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

    const excludeBuyerId = order.buyerId;
    const filtered = bidRows.filter((b) => b.bidderId !== excludeBuyerId);
    if (filtered.length === 0) throw new Error("NO_BACKUP_BIDDER");

    const bidsLike: BidLike[] = filtered.map((b) => ({
      bidderId: b.bidderId,
      amountUsd: b.amountUsd,
      maxBidUsd: b.maxBidUsd,
      createdAt: b.createdAt,
    }));
    const startingHigh = listing.startingBidUsd ?? listing.priceUsd;
    const resolved = resolveProxyAuction(startingHigh, bidsLike);
    if (!resolved.leaderBidderId) throw new Error("NO_BACKUP_BIDDER");

    const newLeaderId = resolved.leaderBidderId;
    const itemPriceUsd = resolved.displayUsd;

    const backupUser = await tx.user.findUnique({ where: { id: newLeaderId }, select: { username: true } });
    if (!backupUser) throw new Error("NO_BACKUP_BIDDER");

    const leaderBids = filtered.filter((b) => b.bidderId === newLeaderId);
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

    await tx.order.delete({ where: { id: order.id } });
    await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
      listingId: listing.id,
      userId: order.buyerId,
    });

    const priceStr = itemPriceUsd.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    const titleShort = listing.title.length > 80 ? `${listing.title.slice(0, 77)}…` : listing.title;

    const { orderId } = await createOrderFromAuctionWin(tx, {
      listingId: listing.id,
      listingTitle: listing.title,
      buyerId: newLeaderId,
      sellerId: listing.sellerId,
      itemPriceUsd,
      shippingPriceUsd: listing.shippingPriceUsd,
      sellerShipFromAddressId: listing.shipFromAddressId ?? null,
      notify: {
        buyerTitle: "You’re next in line",
        buyerBody: `You’re next in line for “${titleShort}”. Complete payment within 30 minutes — open your order and use Pay now (${priceStr} + shipping).`,
        sellerTitle: "Offer sent to next bidder",
        sellerBody: `You offered “${titleShort}” to @${backupUser.username} at ${priceStr}. They have 30 minutes to pay.`,
      },
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

    await tx.listing.update({
      where: { id: listing.id },
      data: { currentBidUsd: itemPriceUsd },
    });

    return { orderId, backupUsername: backupUser.username, priceStr, titleShort };
  });

  await logSellerCommerceEvent({
    sellerId,
    listingId: args.listingId,
    orderId: result.orderId,
    kind: SELLER_COMMERCE_KIND.recoveryNextBidder,
    title: "Seller offered item to next bidder",
    body: `Next bidder @${result.backupUsername} has 30 minutes to pay (${result.priceStr}) for “${result.titleShort}”.`,
  });

  return { orderId: result.orderId };
}

/** Remove expired unpaid order and move listing to draft or relist as active / auction_live. */
export async function relistAfterExpiredAuction(args: {
  listingId: string;
  actorUserId: string;
  actorIsAdmin: boolean;
  targetStatus: "draft" | "active";
}): Promise<void> {
  await processAuctionPaymentExpiries();
  const { sellerId } = await assertSellerOrAdmin(args.listingId, args.actorUserId, args.actorIsAdmin);

  const listing = await prisma.listing.findUnique({
    where: { id: args.listingId },
    select: {
      id: true,
      sellerId: true,
      status: true,
      buyingFormat: true,
      auctionDurationDays: true,
      title: true,
      shippingBaseWeightOz: true,
      shippingIncrementalWeightOz: true,
      shippingCategory: true,
    },
  });
  if (!listing) throw new Error("NOT_FOUND");
  if (listing.status !== "auction_ended_unpaid") throw new Error("INVALID_STATUS");

  if (args.targetStatus === "active") {
    await assertSellerCanPublishListing(prisma, listing.sellerId, {
      shippingBaseWeightOz: listing.shippingBaseWeightOz,
      shippingIncrementalWeightOz: listing.shippingIncrementalWeightOz,
      shippingCategory: listing.shippingCategory,
    });
  }

  const orderBefore = await prisma.order.findUnique({
    where: { listingId: args.listingId },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    const row = await tx.listing.findUnique({
      where: { id: args.listingId },
      select: { status: true, buyingFormat: true, auctionDurationDays: true, title: true },
    });
    if (!row || row.status !== "auction_ended_unpaid") throw new Error("INVALID_STATUS");

    const ord = await tx.order.findUnique({
      where: { listingId: args.listingId },
      select: { id: true, buyerId: true },
    });
    if (ord) {
      await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
        listingId: args.listingId,
        userId: ord.buyerId,
      });
      await tx.order.delete({ where: { id: ord.id } });
    }

    if (args.targetStatus === "draft") {
      await tx.listing.update({
        where: { id: args.listingId },
        data: { status: "draft", workspaceKey: null },
      });
      return;
    }

    if (row.buyingFormat === "buy_now") {
      await tx.listing.update({
        where: { id: args.listingId },
        data: { status: "active", auctionEndsAt: null },
      });
    } else {
      const days = defaultAuctionDurationDays(row.auctionDurationDays);
      const ends = computeAuctionEndsAt(new Date(), days);
      await tx.listing.update({
        where: { id: args.listingId },
        data: { status: "auction_live", auctionEndsAt: ends },
      });
    }
  });

  const lt = listing.title.length > 90 ? `${listing.title.slice(0, 87)}…` : listing.title;
  const wentLive = args.targetStatus === "active";
  await logSellerCommerceEvent({
    sellerId,
    listingId: args.listingId,
    orderId: orderBefore?.id ?? null,
    kind: SELLER_COMMERCE_KIND.recoveryRelist,
    title: "Listing relisted",
    body: wentLive
      ? `“${lt}” is live again${listing.buyingFormat === "auction" ? " as an auction" : ""}.`
      : `“${lt}” was returned to draft so you can edit before publishing.`,
  });
}

/** Remove expired order and discard the auction outcome (listing back to draft for editing). */
export async function cancelExpiredAuctionResult(args: {
  listingId: string;
  actorUserId: string;
  actorIsAdmin: boolean;
}): Promise<void> {
  await processAuctionPaymentExpiries();
  const { sellerId } = await assertSellerOrAdmin(args.listingId, args.actorUserId, args.actorIsAdmin);

  const listing = await prisma.listing.findUnique({
    where: { id: args.listingId },
    select: { id: true, status: true, title: true },
  });
  if (!listing) throw new Error("NOT_FOUND");
  if (listing.status !== "auction_ended_unpaid") throw new Error("INVALID_STATUS");

  const orderBefore = await prisma.order.findUnique({
    where: { listingId: args.listingId },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    const row = await tx.listing.findUnique({ where: { id: args.listingId }, select: { status: true } });
    if (!row || row.status !== "auction_ended_unpaid") throw new Error("INVALID_STATUS");
    const ord = await tx.order.findUnique({
      where: { listingId: args.listingId },
      select: { id: true, buyerId: true },
    });
    if (ord) {
      await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
        listingId: args.listingId,
        userId: ord.buyerId,
      });
      await tx.order.delete({ where: { id: ord.id } });
    }
    await tx.listing.update({
      where: { id: args.listingId },
      data: { status: "draft", auctionEndsAt: null, workspaceKey: null },
    });
  });

  const lt = listing.title.length > 90 ? `${listing.title.slice(0, 87)}…` : listing.title;
  await logSellerCommerceEvent({
    sellerId,
    listingId: args.listingId,
    orderId: orderBefore?.id ?? null,
    kind: SELLER_COMMERCE_KIND.recoveryCancel,
    title: "Auction result cancelled",
    body: `You cancelled the unpaid auction outcome for “${lt}”. The listing is back in draft.`,
  });
}
