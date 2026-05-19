export type MarketplaceCategory = "Trading Cards" | "Memorabilia" | "Watches" | "Sneakers" | "Other";

/** How the listing is purchased: fixed price vs timed bidding */
export type MarketplaceBuyingFormat = "buy_now" | "auction";

export type MarketplaceListing = {
  id: string;
  title: string;
  price: number;
  imageSeed: string;
  /** When set (e.g. seller-uploaded photos), cards and gallery use these URLs instead of the image seed. */
  imageUrls?: string[];
  sellerUsername: string;
  /** Omitted until a real seller reputation aggregate exists. */
  sellerRating?: number;
  sellerVerified: boolean;
  category: MarketplaceCategory;
  buyingFormat: MarketplaceBuyingFormat;
  /** Shown on card for auctions only, e.g. "2h left" */
  auctionTimeLeft?: string;
  condition: string;
  /** ISO timestamp — used for “recently listed” sort only */
  listedAt: string;
  vaultPick?: boolean;
  href: string;
  /** Signed-in seller who created this listing (local listings only). */
  sellerId?: string;
  longDescription?: string;
  shippingPriceUsd?: number;
  handlingTimeLabel?: string;
  signatureRequired?: boolean;
  reservePrice?: number;
  /** For timed auctions from seller flow — used to compute end time on the item page. */
  auctionDurationDays?: number;
  /** When strictly `true`, buyers see “Make offer” on the item page. */
  allowOffers?: boolean;
  /** Optional floor for offers (validated client-side until checkout API exists). */
  minimumOfferUsd?: number;
  /** When strictly `true`, buyers can start structured trade offers. */
  acceptTradeOffers?: boolean;
  /** DB-backed listing lifecycle. */
  listingStatus?:
    | "draft"
    | "active"
    | "sold"
    | "auction_live"
    | "awaiting_auction_payment"
    | "auction_ended_unpaid"
    | "ended";
  /** Auction: server ISO end time for countdown. */
  auctionEndsAtIso?: string | null;
  /** Auction: opening bid from seller. */
  startingBidUsd?: number;
  /** Auction: high bid amount, or null when there are no bids yet. */
  currentBidUsd?: number | null;
  /** Auction: number of bids placed. */
  auctionBidCount?: number;
  /** Buyer-facing: seller ship origin region (state + country), when available. */
  shipsFromRegion?: string;
  /** Official Get Vaulted / company merch listing (no marketplace platform fee on checkout). */
  isCompanyListing?: boolean;
};

export const marketplaceCategories: (MarketplaceCategory | "All")[] = [
  "All",
  "Trading Cards",
  "Memorabilia",
  "Watches",
  "Sneakers",
  "Other",
];

/** Published listings come from `GET /api/listings`; this array stays empty in production builds. */
export const marketplaceListings: MarketplaceListing[] = [];

export function getMarketplaceListingBySlug(slug: string): MarketplaceListing | undefined {
  const decoded = decodeURIComponent(slug);
  return marketplaceListings.find(
    (l) => l.id === decoded || l.href === `/listing/${decoded}` || l.href === `/marketplace/${decoded}`,
  );
}

export function getRelatedMarketplaceListings(
  listing: MarketplaceListing,
  limit = 4,
  pool?: MarketplaceListing[],
): MarketplaceListing[] {
  const base = pool ?? marketplaceListings;
  const seen = new Set<string>();
  const merged: MarketplaceListing[] = [];
  for (const l of base) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    merged.push(l);
  }
  const others = merged.filter((l) => l.id !== listing.id);
  const scored = others.map((l) => {
    let score = 0;
    if (l.sellerUsername === listing.sellerUsername) score += 2;
    if (l.category === listing.category) score += 1;
    return { l, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.l);
}
