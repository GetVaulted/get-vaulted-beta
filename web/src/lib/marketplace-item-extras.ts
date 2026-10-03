import type { MarketplaceListing } from "@/content/marketplace-listings";
import { minNextBidUsd } from "@/lib/auction";
import { MARKETPLACE_MAX_PHOTOS } from "@/lib/listing-photo-requirements";

export type ItemPageExtras = {
  description: string;
  shippingSummary: string;
  authenticationLabel?: string;
  gallerySeeds: string[];
  /** When present, item gallery prefers these URLs (seller photos). */
  galleryImageUrls?: string[];
  currentBid: number;
  /** Auction: opening bid from seller */
  startingBidUsd?: number;
  /** Next valid bid (auction) */
  minNextBidUsd?: number;
  /** Auction: number of bids */
  bidCount?: number;
  /** True when auction is closed (sold, time elapsed, or no longer auction format). */
  auctionEnded?: boolean;
  /** Real count of buyers who have this listing on their watchlist. */
  watchingCount: number;
  /** Buy-now scarcity; when 1, show “Only 1 available” */
  stockRemaining: number;
  shipSpeedLine: string;
  /** Short seller credibility line for item page (e.g. sales count or “Top seller”) */
  sellerCredibilityLabel: string;
  /** Server-time auction end for live countdown (auction listings only) */
  auctionEndsAt?: string;
  /** Display string for estimated shipping charge at checkout */
  estimatedShippingDisplay: string;
  /** e.g. "TX, US" when seller configured ship-from */
  shipsFromDisplay: string | null;
  /** Seller handling / dispatch estimate copy */
  handlingEstimateDisplay: string;
  /** Shown to buyers: tracking after purchase */
  trackingAfterPurchaseLine: string;
};

function authenticationFromCondition(condition: string): string | undefined {
  const c = condition.trim();
  if (/^(PSA|BGS|SGC)\s/i.test(c)) return `${c} — slab verified; cert lookup supported after purchase.`;
  if (/authenticated|uda|loa/i.test(c)) return `${c} — documentation available from seller after purchase.`;
  return undefined;
}

/**
 * Real, non-fabricated fallback shown when a seller has no completed orders yet. Previously this
 * (and the "watching" count) were random numbers derived from a hash of the username/listing id
 * and presented to buyers as if they were real sales/social-proof metrics — a deceptive/misleading
 * commerce practice flagged in the 2026-07 legal & compliance audit. Real counts must be supplied
 * by the caller (see `realSellerCredibilityLabel` / `WatchlistItem` counts in the page loader).
 */
export const NEW_SELLER_CREDIBILITY_LABEL = "New to Get Vaulted";

function defaultDescription(listing: MarketplaceListing) {
  return `This ${listing.title} is sold as pictured. Ask the seller for more photos before you buy. See the shipping details below for handling time and tracking.`;
}

function defaultShippingSummary(listing: MarketplaceListing) {
  if (listing.tradeOnly) {
    return "On accepted trades, each party buys their own shipping label for the items they send. Label cost is quoted from your addresses after the trade is accepted — it is not a $0 listing shipping fee.";
  }
  // `shippingPriceUsd <= 0` means carrier-calculated at checkout (same as usesCarrierCalculatedShipping),
  // not "free $0.00 flat shipping".
  if (
    listing.shippingPriceUsd != null &&
    Number.isFinite(listing.shippingPriceUsd) &&
    listing.shippingPriceUsd > 0 &&
    listing.handlingTimeLabel
  ) {
    const sig = listing.signatureRequired ? " Signature required on delivery." : "";
    return `Buyer pays $${listing.shippingPriceUsd.toFixed(2)} shipping. ${listing.handlingTimeLabel}.${sig} Tracking is added to your order when the seller purchases a label.`;
  }
  return "Shipping is calculated at checkout from carrier rates to your address. Signature required over $500. Insurance availability depends on the carrier and rate selected. International: duties and import taxes may apply.";
}

export function buildItemPageExtras(
  listing: MarketplaceListing,
  realSignals?: { watchingCount?: number; sellerCredibilityLabel?: string },
): ItemPageExtras {
  const galleryImageUrls =
    listing.imageUrls && listing.imageUrls.length > 0
      ? listing.imageUrls.slice(0, MARKETPLACE_MAX_PHOTOS)
      : undefined;

  const gallerySeeds = [
    listing.imageSeed,
    `${listing.imageSeed}-detail-1`,
    `${listing.imageSeed}-detail-2`,
  ];

  const isAuction = listing.buyingFormat === "auction";
  const starting =
    isAuction && typeof listing.startingBidUsd === "number" && Number.isFinite(listing.startingBidUsd)
      ? listing.startingBidUsd
      : isAuction
        ? listing.price
        : listing.price;
  const currentHigh =
    isAuction && listing.currentBidUsd != null && Number.isFinite(listing.currentBidUsd)
      ? listing.currentBidUsd
      : isAuction
        ? starting
        : listing.price;
  const currentBid = isAuction ? currentHigh : listing.price;

  const hoursAhead = 2 + (listing.id.charCodeAt(1) % 6) * 0.5;
  const auctionEndsFromDuration =
    isAuction && listing.auctionDurationDays && !listing.auctionEndsAtIso
      ? new Date(Date.now() + listing.auctionDurationDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
  const auctionEndsAt =
    isAuction && listing.auctionEndsAtIso
      ? listing.auctionEndsAtIso
      : isAuction
        ? (auctionEndsFromDuration ?? new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString())
        : undefined;

  const bidCount = isAuction ? (listing.auctionBidCount ?? 0) : undefined;
  const minNext = isAuction ? minNextBidUsd(currentHigh) : undefined;
  const now = Date.now();
  const auctionEnded =
    isAuction &&
    (listing.listingStatus === "sold" ||
      (listing.auctionEndsAtIso != null && new Date(listing.auctionEndsAtIso).getTime() <= now));

  const estimatedShippingDisplay = listing.tradeOnly
    ? "Each party buys their own label"
    : listing.shippingPriceUsd != null && Number.isFinite(listing.shippingPriceUsd) && listing.shippingPriceUsd > 0
      ? listing.shippingPriceUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
      : "Estimated at checkout";

  const handlingEstimateDisplay = (() => {
    const trimmed = listing.handlingTimeLabel?.trim();
    if (!trimmed || trimmed === "—" || trimmed === "-") {
      return "Typically ships within 1–2 business days";
    }
    return trimmed;
  })();

  const shipsFromDisplay =
    typeof listing.shipsFromRegion === "string" && listing.shipsFromRegion.trim() ? listing.shipsFromRegion.trim() : null;

  const trackingAfterPurchaseLine = listing.tradeOnly
    ? "After a trade is accepted, each participant purchases a carrier label for the package they send. Tracking is added when labels are bought."
    : "After your payment clears, the seller purchases a carrier label and tracking is added to your order automatically when available.";

  return {
    description: listing.longDescription?.trim() ? listing.longDescription.trim() : defaultDescription(listing),
    shippingSummary: defaultShippingSummary(listing),
    authenticationLabel: authenticationFromCondition(listing.condition),
    gallerySeeds,
    galleryImageUrls,
    currentBid,
    startingBidUsd: isAuction ? starting : undefined,
    minNextBidUsd: minNext,
    bidCount,
    auctionEnded,
    watchingCount: realSignals?.watchingCount ?? 0,
    stockRemaining: listing.buyingFormat === "buy_now" ? 1 : 0,
    shipSpeedLine: listing.handlingTimeLabel?.trim() || "Ships in 1–2 business days",
    sellerCredibilityLabel: realSignals?.sellerCredibilityLabel ?? NEW_SELLER_CREDIBILITY_LABEL,
    auctionEndsAt,
    estimatedShippingDisplay,
    shipsFromDisplay,
    handlingEstimateDisplay,
    trackingAfterPurchaseLine,
  };
}
