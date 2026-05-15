import type { BuyingFormat, Listing, ListingImage, ListingStatus } from "@/generated/prisma/client";
import type { MarketplaceBuyingFormat, MarketplaceCategory, MarketplaceListing } from "@/content/marketplace-listings";
import { formatAuctionTimeRemaining } from "@/lib/auction-display";
import {
  formatShipsFromRegion,
  getSellerFulfillmentReadinessIssues,
} from "@/lib/seller-shipping-readiness";
import type { SellerListingStatus, StoredUserListing } from "@/lib/user-listings-storage";

export type ListingSellerFulfillmentSubset = {
  id: string;
  /** Present when loaded via `listingWithSellerFulfillmentInclude`; used server-side only. */
  email?: string | null;
  emailVerified?: Date | null;
  username: string;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  shipFromStreet: string | null;
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromZip: string | null;
  shipFromCountry: string | null;
};

export type ListingWithSellerImages = Listing & {
  seller: ListingSellerFulfillmentSubset;
  images: ListingImage[];
};

function toBuyingFormat(f: BuyingFormat): MarketplaceBuyingFormat {
  return f === "auction" ? "auction" : "buy_now";
}

function toCategory(cat: string): MarketplaceCategory {
  const allowed: MarketplaceCategory[] = ["Trading Cards", "Memorabilia", "Watches", "Sneakers", "Other"];
  return (allowed.includes(cat as MarketplaceCategory) ? cat : "Other") as MarketplaceCategory;
}

function toSellerStatus(s: ListingStatus): SellerListingStatus {
  if (
    s === "draft" ||
    s === "sold" ||
    s === "active" ||
    s === "auction_live" ||
    s === "awaiting_auction_payment" ||
    s === "auction_ended_unpaid"
  )
    return s;
  return "active";
}

export function dbListingToStored(
  row: ListingWithSellerImages,
  pendingOffersCount?: number,
  auctionBidCount?: number,
  opts?: { auctionPaymentDeadlineIso?: string | null },
): StoredUserListing {
  const buyingFormat = toBuyingFormat(row.buyingFormat);
  const displayBid =
    buyingFormat === "auction"
      ? row.currentBidUsd ?? row.startingBidUsd ?? row.priceUsd
      : undefined;

  const fulfillmentWarnings = getSellerFulfillmentReadinessIssues({
    listingStatus: row.status,
    parcel: {
      parcelWeightOz: row.parcelWeightOz,
      parcelLengthIn: row.parcelLengthIn,
      parcelWidthIn: row.parcelWidthIn,
      parcelHeightIn: row.parcelHeightIn,
    },
    seller: row.seller,
  });

  return {
    id: row.id,
    sellerId: row.sellerId,
    sellerUsername: row.seller.username,
    title: row.title,
    category: toCategory(row.category),
    condition: row.condition,
    buyingFormat,
    price: buyingFormat === "auction" ? row.startingBidUsd ?? row.priceUsd : row.priceUsd,
    startingBid: buyingFormat === "auction" ? row.startingBidUsd ?? undefined : undefined,
    reservePrice: row.reservePriceUsd ?? null,
    auctionDurationDays: row.auctionDurationDays ?? undefined,
    description: row.description,
    shippingPriceUsd: row.shippingPriceUsd,
    handlingTime: row.handlingTime || "—",
    signatureRequired: row.signatureRequired,
    imageDataUrls: [...row.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url),
    listedAt: row.createdAt.toISOString(),
    allowOffers: row.allowOffers ? true : undefined,
    acceptTradeOffers: row.acceptTradeOffers ? true : undefined,
    minimumOfferUsd: row.minimumOfferUsd ?? undefined,
    status: toSellerStatus(row.status),
    updatedAt: row.updatedAt.toISOString(),
    views: row.viewsCount,
    watchers: row.watchersCount,
    pendingOffersCount: pendingOffersCount ?? 0,
    displayBid,
    auctionEndsAt: buyingFormat === "auction" ? row.auctionEndsAt?.toISOString() : undefined,
    auctionBidCount: buyingFormat === "auction" ? auctionBidCount ?? 0 : undefined,
    currentBidUsd: buyingFormat === "auction" ? row.currentBidUsd : undefined,
    parcelWeightOz: row.parcelWeightOz ?? null,
    parcelLengthIn: row.parcelLengthIn ?? null,
    parcelWidthIn: row.parcelWidthIn ?? null,
    parcelHeightIn: row.parcelHeightIn ?? null,
    shippingBaseWeightOz: row.shippingBaseWeightOz,
    shippingIncrementalWeightOz: row.shippingIncrementalWeightOz,
    shippingPriceCapCents: row.shippingPriceCapCents ?? null,
    shippingCategory: row.shippingCategory,
    shipAlone: row.shipAlone,
    shipFromAddressId: row.shipFromAddressId ?? null,
    auctionPaymentDeadlineIso:
      row.status === "awaiting_auction_payment" ? (opts?.auctionPaymentDeadlineIso ?? undefined) : undefined,
    fulfillmentWarnings,
    shipsFromRegion: formatShipsFromRegion(row.seller.shipFromState, row.seller.shipFromCountry) ?? undefined,
  };
}

export function dbListingToMarketplace(
  row: ListingWithSellerImages,
  opts?: { bidCount?: number },
): MarketplaceListing {
  const buyingFormat = toBuyingFormat(row.buyingFormat);
  const auctionTimeLeft =
    buyingFormat !== "auction"
      ? undefined
      : row.auctionEndsAt
        ? formatAuctionTimeRemaining(row.auctionEndsAt.toISOString())
        : undefined;

  const displayPrice =
    buyingFormat === "auction" ? (row.currentBidUsd ?? row.startingBidUsd ?? row.priceUsd) : row.priceUsd;

  const shipsFromRegion = formatShipsFromRegion(row.seller.shipFromState, row.seller.shipFromCountry);

  return {
    id: row.id,
    title: row.title,
    price: displayPrice,
    imageSeed: `db-${row.id}`,
    imageUrls: row.images.length > 0 ? [...row.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url) : undefined,
    sellerUsername: row.seller.username,
    sellerVerified: Boolean(row.seller.emailVerified),
    category: toCategory(row.category),
    buyingFormat,
    auctionTimeLeft,
    condition: row.condition,
    listedAt: row.createdAt.toISOString(),
    href: `/marketplace/${encodeURIComponent(row.id)}`,
    sellerId: row.sellerId,
    longDescription: row.description,
    shippingPriceUsd: row.shippingPriceUsd,
    handlingTimeLabel: row.handlingTime,
    signatureRequired: row.signatureRequired,
    reservePrice: row.reservePriceUsd ?? undefined,
    auctionDurationDays: row.auctionDurationDays ?? undefined,
    allowOffers: row.allowOffers ? true : undefined,
    acceptTradeOffers: row.acceptTradeOffers ? true : undefined,
    minimumOfferUsd: row.minimumOfferUsd ?? undefined,
    vaultPick: row.vaultPick ? true : undefined,
    listingStatus: row.status,
    auctionEndsAtIso: buyingFormat === "auction" ? row.auctionEndsAt?.toISOString() ?? null : undefined,
    startingBidUsd: buyingFormat === "auction" ? row.startingBidUsd ?? row.priceUsd : undefined,
    currentBidUsd: buyingFormat === "auction" ? row.currentBidUsd : undefined,
    auctionBidCount: buyingFormat === "auction" ? opts?.bidCount ?? 0 : undefined,
    shipsFromRegion: shipsFromRegion ?? undefined,
    isCompanyListing: row.isCompanyListing ? true : undefined,
  };
}
