import { Prisma } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { roundUsd } from "@/lib/round-usd";
import {
  consumeListingInventoryHoldTx,
  reserveListingInventoryHoldTx,
  releaseActiveInventoryHoldsForListingAndBuyerTx,
} from "@/lib/live-auction-inventory-hold";
import { buyerShippingSnapshotFromAddress } from "@/lib/live-buy-now-purchase";
import { createNotification } from "@/lib/notifications";
import { addOrderToLiveShippingSessionTx } from "@/services/shipping/live-shipping-pricing";
import { AUCTION_WINNER_PAYMENT_WINDOW_MS, PAYMENT_PENDING } from "@/services/payments";
import { prisma } from "@/lib/prisma";
import type { ShipToAddress } from "@/lib/stripe-tax";

const OFFER_SHIP_PLACEHOLDER = {
  shipRecipientName: "Add shipping address",
  shipAddress: "Complete checkout with your delivery address",
  shipCity: "—",
  shipState: "—",
  shipZip: "00000",
  shipCountry: "US",
} as const;

export async function loadBuyerShipToForOffer(buyerId: string): Promise<ShipToAddress | null> {
  const addr = await prisma.address.findFirst({
    where: { userId: buyerId, isDefault: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!addr?.state?.trim() || !addr.postalCode?.trim()) return null;
  return {
    shipRecipientName: addr.fullName?.trim() || addr.name?.trim() || "Buyer",
    shipAddress: [addr.line1, addr.line2].filter(Boolean).join(", "),
    shipCity: addr.city,
    shipState: addr.state,
    shipZip: addr.postalCode,
    shipCountry: addr.country ?? "US",
  };
}

/** Creates an unpaid order at the agreed price — buyer pays via Checkout (sales tax applied at payment). */
export async function createOrderFromAcceptedOffer(
  tx: TransactionClient,
  params: {
    listingId: string;
    listingTitle: string;
    buyerId: string;
    sellerId: string;
    itemPriceUsd: number;
    shippingPriceUsd: number;
    shipTo?: ShipToAddress | null;
    buyerAddressId?: string | null;
  },
): Promise<{ orderId: string }> {
  const existingOrder = await tx.order.findUnique({
    where: { listingId: params.listingId },
    select: { id: true, buyerId: true },
  });
  if (existingOrder) {
    if (existingOrder.buyerId !== params.buyerId) {
      throw new Error("LISTING_ALREADY_SOLD_OTHER_BUYER");
    }
    await tx.listing.updateMany({
      where: {
        id: params.listingId,
        status: { in: ["active", "auction_live"] },
        moderationRemovedAt: null,
      },
      data: { status: "awaiting_auction_payment" },
    });
    return { orderId: existingOrder.id };
  }

  const ship = params.shipTo ?? OFFER_SHIP_PLACEHOLDER;
  const totalUsd = params.itemPriceUsd + params.shippingPriceUsd;
  const paymentDeadlineAt = new Date(Date.now() + AUCTION_WINNER_PAYMENT_WINDOW_MS);
  await reserveListingInventoryHoldTx(tx, {
    listingId: params.listingId,
    userId: params.buyerId,
    source: "offer_accept",
  });
  let orderId: string;
  try {
    const order = await tx.order.create({
      data: {
        listingId: params.listingId,
        buyerId: params.buyerId,
        sellerId: params.sellerId,
        itemPriceUsd: params.itemPriceUsd,
        shippingPriceUsd: params.shippingPriceUsd,
        taxUsd: 0,
        totalUsd,
        status: "pending",
        paymentStatus: PAYMENT_PENDING,
        fulfillmentStatus: "pending",
        paymentLabel: "",
        paymentDeadlineAt,
        buyerAddressId: params.buyerAddressId ?? undefined,
        ...ship,
      },
      select: { id: true },
    });
    orderId = order.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const recovered = await tx.order.findUnique({
        where: { listingId: params.listingId },
        select: { id: true, buyerId: true },
      });
      if (recovered) {
        if (recovered.buyerId !== params.buyerId) {
          await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
            listingId: params.listingId,
            userId: params.buyerId,
          });
          throw new Error("LISTING_ALREADY_SOLD_OTHER_BUYER");
        }
        await consumeListingInventoryHoldTx(tx, {
          listingId: params.listingId,
          userId: params.buyerId,
          orderId: recovered.id,
        });
        await tx.listing.updateMany({
          where: {
            id: params.listingId,
            status: { in: ["active", "auction_live"] },
            moderationRemovedAt: null,
          },
          data: { status: "awaiting_auction_payment" },
        });
        return { orderId: recovered.id };
      }
    }
    throw e;
  }

  await consumeListingInventoryHoldTx(tx, {
    listingId: params.listingId,
    userId: params.buyerId,
    orderId,
  });

  const sold = await tx.listing.updateMany({
    where: {
      id: params.listingId,
      status: { in: ["active", "auction_live"] },
      moderationRemovedAt: null,
    },
    data: { status: "awaiting_auction_payment" },
  });
  if (sold.count !== 1) {
    throw new Error("LISTING_UNAVAILABLE");
  }

  const titleShort = params.listingTitle.length > 80 ? `${params.listingTitle.slice(0, 77)}…` : params.listingTitle;
  await createNotification(tx, {
    userId: params.buyerId,
    type: "offer_accepted",
    title: "Offer accepted",
    body: `Your offer on “${titleShort}” was accepted. Complete payment to finalize — sales tax applies where required.`,
    href: `/orders/${encodeURIComponent(orderId)}`,
  });
  await createNotification(tx, {
    userId: params.sellerId,
    type: "offer_accepted_pending_payment",
    title: "Offer accepted — awaiting payment",
    body: `“${titleShort}” — buyer must complete checkout (including sales tax where required).`,
    href: "/account/sales",
  });

  return { orderId };
}

/** Winning auction bid: uses checkout from the winning bid when present; otherwise placeholders. */
export async function createOrderFromAuctionWin(
  tx: TransactionClient,
  params: {
    listingId: string;
    listingTitle: string;
    buyerId: string;
    sellerId: string;
    itemPriceUsd: number;
    shippingPriceUsd: number;
    shipRecipientName?: string;
    shipAddress?: string;
    shipCity?: string;
    shipState?: string;
    shipZip?: string;
    shipCountry?: string;
    paymentLabel?: string;
    buyerAddressId?: string | null;
    sellerShipFromAddressId?: string | null;
    /** When set, overrides default auction win notifications (e.g. next-bidder recovery). */
    notify?: {
      buyerTitle: string;
      buyerBody: string;
      sellerTitle: string;
      sellerBody: string;
    };
    /** When set, live bundle + zero upfront shipping apply only to this live show / queue row. */
    liveAuctionLiveShowId?: string | null;
    liveRoomItemId?: string | null;
    /** Skip buyer/seller auction-win notifications (send after commit from caller). */
    skipWinNotifications?: boolean;
  },
): Promise<{ orderId: string }> {
  const existingOrder = await tx.order.findUnique({
    where: { listingId: params.listingId },
    select: { id: true, paymentStatus: true, buyerId: true },
  });
  if (existingOrder) {
    if (existingOrder.buyerId !== params.buyerId) {
      throw new Error("LISTING_ALREADY_SOLD_OTHER_BUYER");
    }
    if (existingOrder.paymentStatus === "paid") {
      await consumeListingInventoryHoldTx(tx, {
        listingId: params.listingId,
        userId: params.buyerId,
        orderId: existingOrder.id,
      });
      await tx.listing.updateMany({
        where: {
          id: params.listingId,
          status: { in: ["active", "auction_live", "awaiting_auction_payment"] },
          moderationRemovedAt: null,
        },
        data: { status: "sold" },
      });
    } else {
      await reserveListingInventoryHoldTx(tx, {
        listingId: params.listingId,
        userId: params.buyerId,
        source: "auction_win_order",
        liveRoomItemId: params.liveRoomItemId ?? null,
      });
      const deadline = new Date(Date.now() + AUCTION_WINNER_PAYMENT_WINDOW_MS);
      await tx.order.updateMany({
        where: { id: existingOrder.id, paymentDeadlineAt: null, paymentStatus: "pending_payment" },
        data: { paymentDeadlineAt: deadline },
      });
      await tx.listing.updateMany({
        where: {
          id: params.listingId,
          status: { in: ["active", "auction_live", "auction_ended_unpaid"] },
          moderationRemovedAt: null,
        },
        data: { status: "awaiting_auction_payment" },
      });
    }
    return { orderId: existingOrder.id };
  }

  const hasLiveAuctionContext =
    Boolean(params.liveAuctionLiveShowId) &&
    Boolean(params.liveRoomItemId) &&
    Boolean(
      await tx.liveRoomItem.findFirst({
        where: {
          id: params.liveRoomItemId!,
          liveRoomId: params.liveAuctionLiveShowId!,
          liveRoom: { sellerId: params.sellerId, roomType: { in: ["auction", "break"] } },
        },
        select: { id: true },
      }),
    );
  const shippingPriceUsd = hasLiveAuctionContext ? 0 : params.shippingPriceUsd;
  const itemPriceUsd = roundUsd(params.itemPriceUsd);
  const totalUsd = roundUsd(itemPriceUsd + shippingPriceUsd);
  const hasShip =
    params.shipRecipientName &&
    params.shipAddress &&
    params.shipCity &&
    params.shipState &&
    params.shipZip &&
    params.shipCountry;
  /** Prefer explicit ship-to; otherwise stamp Wallet default so TX (and other nexus) tax can apply at charge. */
  let shipRecipientName: string;
  let shipAddress: string;
  let shipCity: string;
  let shipState: string;
  let shipZip: string;
  let shipCountry: string;
  let buyerAddressId = params.buyerAddressId ?? null;
  if (hasShip) {
    shipRecipientName = params.shipRecipientName!;
    shipAddress = params.shipAddress!;
    shipCity = params.shipCity!;
    shipState = params.shipState!;
    shipZip = params.shipZip!;
    shipCountry = params.shipCountry!;
  } else {
    const addr = await tx.address.findFirst({
      where: { userId: params.buyerId, type: "shipping" },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    const snap = addr ? buyerShippingSnapshotFromAddress(addr) : null;
    if (snap) {
      shipRecipientName = snap.shipRecipientName;
      shipAddress = snap.shipAddress;
      shipCity = snap.shipCity;
      shipState = snap.shipState;
      shipZip = snap.shipZip;
      shipCountry = snap.shipCountry;
      buyerAddressId = buyerAddressId ?? snap.buyerAddressId;
    } else {
      shipRecipientName = "Auction won";
      shipAddress = "Coordinate shipping with the seller";
      shipCity = "—";
      shipState = "—";
      shipZip = "00000";
      shipCountry = "US";
    }
  }
  const paymentLabel = (params.paymentLabel && params.paymentLabel.trim()) || "auction";
  /** Live-show wins stay open until the buyer recovers in-room — no timed expiry during the broadcast. */
  const paymentDeadlineAt = hasLiveAuctionContext
    ? null
    : new Date(Date.now() + AUCTION_WINNER_PAYMENT_WINDOW_MS);

  await reserveListingInventoryHoldTx(tx, {
    listingId: params.listingId,
    userId: params.buyerId,
    source: "auction_win_order",
    liveRoomItemId: params.liveRoomItemId ?? null,
  });

  let orderId: string;
  try {
    const order = await tx.order.create({
      data: {
        listingId: params.listingId,
        buyerId: params.buyerId,
        sellerId: params.sellerId,
        itemPriceUsd,
        shippingPriceUsd,
        taxUsd: 0,
        totalUsd,
        status: "pending",
        paymentStatus: "pending_payment",
        fulfillmentStatus: "pending",
        paymentLabel,
        paymentDeadlineAt,
        shipRecipientName,
        shipAddress,
        shipCity,
        shipState,
        shipZip,
        shipCountry,
        buyerAddressId,
        sellerShipFromAddressId: params.sellerShipFromAddressId ?? null,
      },
      select: { id: true },
    });
    orderId = order.id;
    if (hasLiveAuctionContext) {
      await addOrderToLiveShippingSessionTx(tx, orderId, {
        liveShowId: params.liveAuctionLiveShowId ?? null,
        liveRoomItemId: params.liveRoomItemId ?? null,
      });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const recovered = await tx.order.findUnique({
        where: { listingId: params.listingId },
        select: { id: true, buyerId: true },
      });
      if (recovered) {
        if (recovered.buyerId !== params.buyerId) {
          await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
            listingId: params.listingId,
            userId: params.buyerId,
          });
          throw new Error("LISTING_ALREADY_SOLD_OTHER_BUYER");
        }
        await tx.order.updateMany({
          where: { id: recovered.id, paymentDeadlineAt: null, paymentStatus: "pending_payment" },
          data: {
            paymentDeadlineAt: hasLiveAuctionContext
              ? null
              : new Date(Date.now() + AUCTION_WINNER_PAYMENT_WINDOW_MS),
          },
        });
        await tx.listing.updateMany({
          where: {
            id: params.listingId,
            status: { in: ["active", "auction_live", "auction_ended_unpaid"] },
            moderationRemovedAt: null,
          },
          data: { status: "awaiting_auction_payment" },
        });
        return { orderId: recovered.id };
      }
    }
    throw e;
  }

  const settled = await tx.listing.updateMany({
    where: {
      id: params.listingId,
      status: { in: ["active", "auction_live", "auction_ended_unpaid"] },
      moderationRemovedAt: null,
    },
    data: { status: "awaiting_auction_payment" },
  });
  if (settled.count !== 1) {
    throw new Error("LISTING_UNAVAILABLE");
  }

  const titleShort = params.listingTitle.length > 80 ? `${params.listingTitle.slice(0, 77)}…` : params.listingTitle;
  const priceStr = params.itemPriceUsd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const buyerTitle = params.notify?.buyerTitle ?? "You won the auction";
  const buyerBody =
    params.notify?.buyerBody ??
    (hasLiveAuctionContext
      ? `You won “${titleShort}” at ${priceStr}. Update your payment method in the show to continue.`
      : `You won “${titleShort}” at ${priceStr}. You have 30 minutes to pay — open your order and use Pay now.`);
  const sellerTitle = params.notify?.sellerTitle ?? "Auction ended — payment pending";
  const sellerBody =
    params.notify?.sellerBody ??
    (hasLiveAuctionContext
      ? `Payment pending for “${titleShort}”. The show waits until the winner updates payment.`
      : `Winner has 30 minutes to pay for “${titleShort}”. You will be notified when payment clears.`);
  if (!params.skipWinNotifications) {
    await createNotification(tx, {
      userId: params.buyerId,
      type: "auction_won",
      title: buyerTitle,
      body: buyerBody,
      href: `/orders/${encodeURIComponent(orderId)}`,
    });
    await createNotification(tx, {
      userId: params.sellerId,
      type: "auction_pending_payment",
      title: sellerTitle,
      body: sellerBody,
      href: "/account/sales",
    });
  }

  return { orderId };
}

export async function declineOtherOpenOffersOnListing(
  tx: TransactionClient,
  listingId: string,
  keepOfferId: string,
): Promise<void> {
  await tx.offer.updateMany({
    where: {
      listingId,
      id: { not: keepOfferId },
      status: { in: ["pending", "countered"] },
    },
    data: { status: "declined" },
  });
}
