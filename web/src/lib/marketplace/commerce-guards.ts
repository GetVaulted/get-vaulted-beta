import type { ListingStatus } from "@/generated/prisma/client";
import { LayawayStatus, OrderPaymentMethod } from "@/generated/prisma/enums";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import {
  isListingPurchasable,
  resolveMarketplaceCanonicalStatus,
  type MarketplaceCanonicalStatus,
} from "@/lib/marketplace/canonical-status";
import { isTradeOnlyListing } from "@/lib/listing-commerce-mode";
import { prisma } from "@/lib/prisma";
import { PAYMENT_PAID, PAYMENT_PENDING } from "@/services/payments";

/** Stable API error codes for marketplace commerce conflicts. */
export type CommerceGuardErrorCode =
  | "ITEM_NOT_AVAILABLE"
  | "ITEM_RESERVED_ON_LAYAWAY"
  | "USE_LAYAWAY_PAYOFF"
  | "ALREADY_SOLD"
  | "CHECKOUT_IN_PROGRESS"
  | "OWN_LISTING";

export class CommerceGuardError extends Error {
  readonly code: CommerceGuardErrorCode;

  constructor(code: CommerceGuardErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CommerceGuardError";
    this.code = code;
  }
}

export type ListingCommerceContext = {
  listing: {
    id: string;
    sellerId: string;
    status: ListingStatus;
    buyingFormat: string;
    moderationRemovedAt: Date | null;
    allowOffers: boolean;
    acceptTradeOffers: boolean;
    allowLayaway: boolean;
    priceUsd: number;
  };
  activeLayaway: {
    id: string;
    buyerId: string;
    orderId: string;
    amountPaidUsd: number;
    depositAmountUsd: number;
  } | null;
  existingOrder: {
    id: string;
    buyerId: string;
    paymentStatus: string;
    paymentMethod: string;
  } | null;
  canonicalStatus: MarketplaceCanonicalStatus;
};

type PrismaClientLike = Pick<typeof prisma, "listing" | "layaway" | "order">;

const listingSelect = {
  id: true,
  sellerId: true,
  status: true,
  buyingFormat: true,
  moderationRemovedAt: true,
  allowOffers: true,
  acceptTradeOffers: true,
  allowLayaway: true,
  priceUsd: true,
} as const;

/** Load listing + active layaway + marketplace order for commerce enforcement. */
export async function loadListingCommerceContext(
  db: PrismaClientLike,
  listingId: string,
): Promise<ListingCommerceContext | null> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: listingSelect,
  });
  if (!listing) return null;

  const [activeLayaway, existingOrder] = await Promise.all([
    db.layaway.findFirst({
      where: { listingId, status: LayawayStatus.active },
      select: {
        id: true,
        buyerId: true,
        orderId: true,
        amountPaidUsd: true,
        depositAmountUsd: true,
      },
    }),
    db.order.findUnique({
      where: { listingId },
      select: { id: true, buyerId: true, paymentStatus: true, paymentMethod: true },
    }),
  ]);

  const canonicalStatus = resolveMarketplaceCanonicalStatus({
    listingStatus: listing.status,
    layawayStatus: activeLayaway ? LayawayStatus.active : null,
    orderPaymentStatus: existingOrder?.paymentStatus ?? null,
    amountPaidUsd: activeLayaway?.amountPaidUsd,
    depositAmountUsd: activeLayaway?.depositAmountUsd,
  });

  return { listing, activeLayaway, existingOrder, canonicalStatus };
}

function assertNotOwnListing(ctx: ListingCommerceContext, buyerId: string): void {
  if (ctx.listing.sellerId === buyerId) throw new CommerceGuardError("OWN_LISTING");
}

function assertLayawayReservation(ctx: ListingCommerceContext, buyerId: string): void {
  const lay = ctx.activeLayaway;
  if (lay && lay.buyerId !== buyerId) {
    throw new CommerceGuardError("ITEM_RESERVED_ON_LAYAWAY");
  }
  if (ctx.listing.status === "layaway_reserved" && lay && lay.buyerId !== buyerId) {
    throw new CommerceGuardError("ITEM_RESERVED_ON_LAYAWAY");
  }
  if (ctx.listing.status === "layaway_reserved" && !lay) {
    throw new CommerceGuardError("ITEM_RESERVED_ON_LAYAWAY");
  }
}

function assertExistingOrderBlocksPurchase(ctx: ListingCommerceContext, buyerId: string): void {
  const order = ctx.existingOrder;
  if (!order) return;

  if (order.paymentStatus === PAYMENT_PAID) {
    throw new CommerceGuardError("ALREADY_SOLD");
  }

  if (
    order.paymentMethod === OrderPaymentMethod.layaway ||
    order.paymentStatus === PAYMENT_LAYAWAY_ACTIVE
  ) {
    if (order.buyerId !== buyerId) throw new CommerceGuardError("ITEM_RESERVED_ON_LAYAWAY");
    throw new CommerceGuardError("USE_LAYAWAY_PAYOFF");
  }

  if (order.paymentStatus === PAYMENT_PENDING && order.buyerId !== buyerId) {
    throw new CommerceGuardError("CHECKOUT_IN_PROGRESS");
  }
}

/** Block Buy Now unless listing is available for this buyer. */
export function assertBuyNowAllowed(ctx: ListingCommerceContext, buyerId: string): void {
  assertNotOwnListing(ctx, buyerId);
  if (isTradeOnlyListing(ctx.listing)) throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  if (ctx.listing.moderationRemovedAt) throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  if (ctx.listing.buyingFormat !== "buy_now") throw new CommerceGuardError("ITEM_NOT_AVAILABLE");

  assertLayawayReservation(ctx, buyerId);
  if (ctx.activeLayaway && ctx.activeLayaway.buyerId === buyerId) {
    throw new CommerceGuardError("USE_LAYAWAY_PAYOFF");
  }

  if (ctx.listing.status === "sold") throw new CommerceGuardError("ALREADY_SOLD");
  if (ctx.listing.status === "layaway_reserved") {
    throw new CommerceGuardError("ITEM_RESERVED_ON_LAYAWAY");
  }
  if (ctx.listing.status !== "active") throw new CommerceGuardError("ITEM_NOT_AVAILABLE");

  assertExistingOrderBlocksPurchase(ctx, buyerId);
  if (!isListingPurchasable(ctx.canonicalStatus)) {
    throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  }
}

/** Block starting a new layaway unless listing is open for this buyer. */
export function assertLayawayStartAllowed(ctx: ListingCommerceContext, buyerId: string): void {
  assertNotOwnListing(ctx, buyerId);
  if (isTradeOnlyListing(ctx.listing)) throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  if (ctx.listing.moderationRemovedAt) throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  if (ctx.listing.buyingFormat !== "buy_now") throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  if (!ctx.listing.allowLayaway) throw new CommerceGuardError("ITEM_NOT_AVAILABLE");

  if (ctx.listing.status === "sold") throw new CommerceGuardError("ALREADY_SOLD");
  if (ctx.activeLayaway) {
    if (ctx.activeLayaway.buyerId === buyerId) throw new CommerceGuardError("CHECKOUT_IN_PROGRESS");
    throw new CommerceGuardError("ITEM_RESERVED_ON_LAYAWAY");
  }
  if (ctx.listing.status === "layaway_reserved") {
    throw new CommerceGuardError("ITEM_RESERVED_ON_LAYAWAY");
  }
  if (ctx.listing.status !== "active") throw new CommerceGuardError("ITEM_NOT_AVAILABLE");

  assertExistingOrderBlocksPurchase(ctx, buyerId);
}

/** Block Make Offer unless listing accepts offers and is not reserved. */
export function assertMakeOfferAllowed(ctx: ListingCommerceContext, buyerId: string): void {
  assertNotOwnListing(ctx, buyerId);
  if (ctx.listing.moderationRemovedAt) throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  if (!ctx.listing.allowOffers) throw new CommerceGuardError("ITEM_NOT_AVAILABLE");

  assertLayawayReservation(ctx, buyerId);
  if (ctx.listing.status === "layaway_reserved") throw new CommerceGuardError("ITEM_RESERVED_ON_LAYAWAY");
  if (ctx.listing.status === "sold") throw new CommerceGuardError("ALREADY_SOLD");
  if (ctx.listing.status !== "active" && ctx.listing.status !== "auction_live") {
    throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  }

  if (ctx.existingOrder) throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  if (ctx.activeLayaway) throw new CommerceGuardError("ITEM_RESERVED_ON_LAYAWAY");
}

/** Block trade offers on listings that are not fully available. */
export function assertTradeOfferListingAllowed(ctx: ListingCommerceContext, actorId: string): void {
  if (ctx.listing.sellerId === actorId) return;
  assertLayawayReservation(ctx, actorId);
  if (ctx.listing.status === "layaway_reserved") throw new CommerceGuardError("ITEM_RESERVED_ON_LAYAWAY");
  if (ctx.listing.status === "sold") throw new CommerceGuardError("ALREADY_SOLD");
  if (ctx.listing.status !== "active" && ctx.listing.status !== "auction_live") {
    throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  }
  if (!ctx.listing.acceptTradeOffers) throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  if (ctx.existingOrder) throw new CommerceGuardError("ITEM_NOT_AVAILABLE");
  if (ctx.activeLayaway) throw new CommerceGuardError("ITEM_RESERVED_ON_LAYAWAY");
}

export function commerceGuardErrorToHttp(code: CommerceGuardErrorCode): { status: number; error: string } {
  switch (code) {
    case "ITEM_RESERVED_ON_LAYAWAY":
      return { status: 409, error: "This item is reserved on layaway and cannot be purchased." };
    case "ITEM_NOT_AVAILABLE":
      return { status: 409, error: "This listing is not available." };
    case "USE_LAYAWAY_PAYOFF":
      return {
        status: 409,
        error: "You have an active layaway on this item. Pay your remaining balance instead of Buy Now.",
      };
    case "ALREADY_SOLD":
      return { status: 409, error: "This item is already sold." };
    case "CHECKOUT_IN_PROGRESS":
      return { status: 409, error: "Checkout already in progress for this listing." };
    case "OWN_LISTING":
      return { status: 400, error: "You cannot purchase your own listing." };
    default:
      return { status: 409, error: "This listing is not available." };
  }
}
