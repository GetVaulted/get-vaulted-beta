import type { MarketplaceBuyingFormat, MarketplaceCategory, MarketplaceListing } from "@/content/marketplace-listings";
import { formatAuctionTimeRemaining } from "@/lib/auction-display";
import type { FulfillmentReadinessIssue } from "@/lib/seller-shipping-readiness";

/** Seller dashboard row shape (matches API JSON). */
export type SellerListingStatus =
  | "active"
  | "draft"
  | "sold"
  | "auction_live"
  | "awaiting_auction_payment"
  | "auction_ended_unpaid"
  | "ended";

export type StoredUserListing = {
  id: string;
  sellerId: string;
  sellerUsername: string;
  title: string;
  category: MarketplaceCategory;
  condition: string;
  buyingFormat: MarketplaceBuyingFormat;
  /** Buy now price, or starting bid when format is auction */
  price: number;
  startingBid?: number;
  reservePrice?: number | null;
  auctionDurationDays?: number;
  description: string;
  shippingPriceUsd: number;
  handlingTime: string;
  signatureRequired: boolean;
  imageDataUrls: string[];
  listedAt: string;
  allowOffers?: boolean;
  acceptTradeOffers?: boolean;
  minimumOfferUsd?: number;
  status?: SellerListingStatus;
  updatedAt?: string;
  views?: number;
  watchers?: number;
  pendingOffersCount?: number;
  displayBid?: number;
  /** ISO — live auction end (DB). */
  auctionEndsAt?: string;
  /** Count of bids (auction listings). */
  auctionBidCount?: number;
  /** High bid; null when no bids yet. */
  currentBidUsd?: number | null;
  /** Shippo parcel (oz / inches). */
  parcelWeightOz?: number | null;
  parcelLengthIn?: number | null;
  parcelWidthIn?: number | null;
  parcelHeightIn?: number | null;
  /** Live-auction shipping pricing weights (separate from Shippo). */
  shippingBaseWeightOz?: number;
  shippingIncrementalWeightOz?: number;
  shippingPriceCapCents?: number | null;
  shippingCategory?: "raw_card" | "slab" | "small_collectible" | "custom";
  shipAlone?: boolean;
  shipFromAddressId?: string | null;
  /** ISO — pay-by deadline when status is `awaiting_auction_payment`. */
  auctionPaymentDeadlineIso?: string;
  /** Seller-only: Stripe, ship-from, and parcel gaps that block fulfillment. */
  fulfillmentWarnings?: FulfillmentReadinessIssue[];
  /** Derived from seller profile for buyer-facing copy. */
  shipsFromRegion?: string;
};

export function effectiveSellerListingStatus(s: StoredUserListing): SellerListingStatus {
  if (s.status === "draft" || s.status === "sold" || s.status === "ended") return s.status;
  if (s.status === "active" || s.status === "auction_live") return s.status;
  if (s.status === "awaiting_auction_payment") return "awaiting_auction_payment";
  if (s.status === "auction_ended_unpaid") return "auction_ended_unpaid";
  return s.buyingFormat === "auction" ? "auction_live" : "active";
}

export function isPublishedOnMarketplace(s: StoredUserListing): boolean {
  const st = effectiveSellerListingStatus(s);
  return st === "active" || st === "auction_live";
}

export function storedToMarketplaceListing(s: StoredUserListing): MarketplaceListing {
  const auctionTimeLeft =
    s.buyingFormat === "auction" && s.auctionEndsAt
      ? formatAuctionTimeRemaining(s.auctionEndsAt)
      : undefined;

  const displayPrice = s.buyingFormat === "auction" ? (s.displayBid ?? s.startingBid ?? s.price) : s.price;

  return {
    id: s.id,
    title: s.title,
    price: displayPrice,
    imageSeed: `user-${s.id}`,
    imageUrls: s.imageDataUrls.length > 0 ? s.imageDataUrls : undefined,
    sellerUsername: s.sellerUsername,
    sellerVerified: false,
    category: s.category,
    buyingFormat: s.buyingFormat,
    auctionTimeLeft,
    condition: s.condition,
    listedAt: s.listedAt,
    href: `/marketplace/${encodeURIComponent(s.id)}`,
    sellerId: s.sellerId,
    longDescription: s.description,
    shippingPriceUsd: s.shippingPriceUsd,
    handlingTimeLabel: s.handlingTime,
    signatureRequired: s.signatureRequired,
    reservePrice: s.reservePrice ?? undefined,
    auctionDurationDays: s.auctionDurationDays,
    allowOffers: s.allowOffers === true ? true : undefined,
    acceptTradeOffers: s.acceptTradeOffers === true ? true : undefined,
    minimumOfferUsd: s.minimumOfferUsd,
    listingStatus: s.status,
    auctionEndsAtIso: s.buyingFormat === "auction" ? s.auctionEndsAt ?? null : undefined,
    startingBidUsd: s.buyingFormat === "auction" ? s.startingBid ?? s.price : undefined,
    currentBidUsd: s.buyingFormat === "auction" ? (s.currentBidUsd ?? null) : undefined,
    auctionBidCount: s.buyingFormat === "auction" ? s.auctionBidCount ?? 0 : undefined,
    shipsFromRegion: s.shipsFromRegion,
  };
}
