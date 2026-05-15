import type { MarketplaceListing } from "@/content/marketplace-listings";
import { minNextBidUsd } from "@/lib/auction";

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
  /** Deterministic “social proof” count for mock data */
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

function stableWatchers(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % 900;
  return 14 + (h % 52);
}

export function buildSellerCredibilityLabel(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h + username.charCodeAt(i) * 19) % 100000;
  const sales = 52 + (h % 948);
  const topSeller = h % 6 === 0;
  if (topSeller) return "Top seller";
  return `${sales.toLocaleString("en-US")} sales`;
}

function defaultDescription(listing: MarketplaceListing) {
  return `This ${listing.title} is sold as pictured. Ask the seller for more photos before you buy. Ships from a verified Get Vaulted seller with tracking and insurance.`;
}

function defaultShippingSummary(listing: MarketplaceListing) {
  if (listing.shippingPriceUsd != null && listing.handlingTimeLabel) {
    const sig = listing.signatureRequired ? " Signature required on delivery." : "";
    return `Buyer pays $${listing.shippingPriceUsd.toFixed(2)} shipping. ${listing.handlingTimeLabel}.${sig} Insured tracking on every order.`;
  }
  return "Ships within 2 business days via insured carrier. Signature required over $500. International: duties and import taxes may apply.";
}

export function buildItemPageExtras(listing: MarketplaceListing): ItemPageExtras {
  const galleryImageUrls =
    listing.imageUrls && listing.imageUrls.length > 0 ? listing.imageUrls.slice(0, 8) : undefined;

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

  const estimatedShippingDisplay =
    listing.shippingPriceUsd != null && Number.isFinite(listing.shippingPriceUsd)
      ? listing.shippingPriceUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
      : "Calculated at checkout";

  const shipsFromDisplay =
    typeof listing.shipsFromRegion === "string" && listing.shipsFromRegion.trim() ? listing.shipsFromRegion.trim() : null;

  const handlingEstimateDisplay =
    listing.handlingTimeLabel?.trim() || "Typically ships within 1–2 business days";

  const trackingAfterPurchaseLine =
    "After your payment clears, the seller purchases a carrier label and tracking is added to your order automatically when available.";

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
    watchingCount: stableWatchers(listing.id),
    stockRemaining: listing.buyingFormat === "buy_now" ? 1 : 0,
    shipSpeedLine: listing.handlingTimeLabel?.trim() || "Ships in 1–2 business days",
    sellerCredibilityLabel: buildSellerCredibilityLabel(listing.sellerUsername),
    auctionEndsAt,
    estimatedShippingDisplay,
    shipsFromDisplay,
    handlingEstimateDisplay,
    trackingAfterPurchaseLine,
  };
}
