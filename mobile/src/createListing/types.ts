import type { CategoryId } from '../types';
import type { ListingChannel } from './listingChannel';
import type { ListingShippoRate, MarketplaceShippingOfferScope } from './shippoRates';
import type { LiveShippingPreset } from './liveShowShipping';

export type ListingCommerceType =
  | 'buy_now'
  | 'auction'
  | 'live_auction'
  | 'break_spot'
  | 'vault_drop'
  | 'trade_only';

export type AiTrackedField =
  | 'title'
  | 'description'
  | 'category'
  | 'subcategory'
  | 'condition'
  | 'authentication'
  | 'brand'
  | 'referenceNumber'
  | 'year'
  | 'grade'
  | 'tags'
  | 'listingType'
  | 'buyNowPrice'
  | 'startingBid';

export type AiFieldConfidence = 'ai_suggestion' | 'confirmed' | 'needs_review';

export type ListingMediaItem = {
  id: string;
  uri: string;
  kind: 'photo' | 'video';
  label?: string;
};

/** Required photo count for publish-ready listings (video is optional). */
export const LISTING_MIN_PHOTOS = 3;
export const LISTING_MAX_PHOTOS = 10;

export function countListingPhotos(media: ListingMediaItem[]): number {
  return media.filter((m) => m.kind === 'photo').length;
}

export const LISTING_COMMERCE_OPTIONS: {
  id: ListingCommerceType;
  label: string;
  sub: string;
  icon: 'pricetag-outline' | 'hammer-outline' | 'radio-outline' | 'grid-outline' | 'flash-outline' | 'swap-horizontal-outline';
}[] = [
  { id: 'buy_now', label: 'Buy Now', sub: 'Fixed vault price', icon: 'pricetag-outline' },
  { id: 'auction', label: 'Auction', sub: 'Timed room bidding', icon: 'hammer-outline' },
  { id: 'live_auction', label: 'Live Auction', sub: 'Hammer on stream', icon: 'radio-outline' },
  { id: 'break_spot', label: 'Break Spot', sub: 'Random / serial teams', icon: 'grid-outline' },
  { id: 'vault_drop', label: 'Vault Drop', sub: 'Hype release lane', icon: 'flash-outline' },
  { id: 'trade_only', label: 'Trade Only', sub: 'Collector offers & swaps', icon: 'swap-horizontal-outline' },
];

export const LISTING_CATEGORY_OPTIONS: { id: CategoryId; label: string }[] = [
  { id: 'cards', label: 'Trading Cards' },
  { id: 'memorabilia', label: 'Sports Memorabilia' },
  { id: 'sneakers', label: 'Sneakers' },
  { id: 'watches', label: 'Watches' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'other', label: 'Other' },
];

export type VerificationSource = 'none' | 'visible_in_media' | 'seller_provided';

/** Published / draft listing card shape used by Create Listing drafts + HQ listings tab */
export type ListingPreview = {
  id: string;
  title: string;
  imageUrl: string;
  price: string;
  status: 'active' | 'draft' | 'sold' | 'expiring' | 'pending' | 'in_auction' | 'ended';
  watches: number;
  /** @deprecated Prefer `channel`. */
  live?: boolean;
  channel?: ListingChannel;
};

export type CreateListingFormState = {
  /** Where this listing will surface — marketplace storefront vs live show queue. */
  listingChannel: ListingChannel | null;
  media: ListingMediaItem[];
  listingType: ListingCommerceType | null;
  category: CategoryId | null;
  /** Multi-select tags within the chosen category (e.g. NFL + Graded + Hobby boxes). */
  subcategories: string[];
  title: string;
  description: string;
  condition: string;
  authentication: string;
  brand: string;
  referenceNumber: string;
  year: string;
  grade: string;
  accessories: string;
  shippingNotes: string;
  tags: string;
  buyNowPrice: string;
  startingBid: string;
  reservePrice: string;
  /** Timed auction length in full days (live show `auction` / `live_auction`). */
  auctionDurationDays: string;
  breakSpots: string;
  spotPrice: string;
  breakFormat: string;
  tradeInterests: string;
  tradeWishlist: string;
  /** @deprecated Legacy snapshot; buyers pick a live quote at checkout. */
  shippingMethod: string;
  packageWeightLb: string;
  packageWeightOz: string;
  packageLengthIn: string;
  packageWidthIn: string;
  packageHeightIn: string;
  shipFromZip: string;
  /** Optional US buyer ZIP — improves zone-based domestic rate estimates when set. */
  shipToZip: string;
  shippingHandlingFee: string;
  /** @deprecated Optional legacy single-rate snapshot; not required to publish. */
  selectedShippoRate: ListingShippoRate | null;
  /** Which Shippo services buyers may select at checkout (listing preview + persistence). */
  marketplaceShippingOfferScope: MarketplaceShippingOfferScope;
  /**
   * When scope is `custom`, allowed `carrier|serviceLevel` keys. Ignored for `all` / `no_overnight`.
   */
  marketplaceAllowedRateKeys: string[];
  /** Shippo returned ≥1 rate for this parcel (cleared when package fields change). */
  marketplaceRatesPreviewOk: boolean;
  /** Count of rates buyers can pick after applying scope + custom filters (≥1 to publish). */
  marketplaceOfferableRateCount: number;
  insurance: boolean;
  signature: boolean;
  international: boolean;
  featureInLive: boolean;
  /** Live show queue — optional link to a scheduled stream. */
  selectedLiveShowId: string | null;
  /**
   * Live show shipping — profile + tiers (marketplace uses Shippo picker on CreateListingShipping).
   */
  liveShippingPreset: LiveShippingPreset;
  liveShippingProfileId: string | null;
  /** When true, item may bundle with other eligible same-show purchases (subject to profile max qty). */
  liveBundleEligible: boolean;
  liveShipFromZip: string;
  liveShipInternational: boolean;
  liveHandlingSurcharge: string;
  liveAdvancedWeightLb: string;
  liveAdvancedLengthIn: string;
  liveAdvancedWidthIn: string;
  liveAdvancedHeightIn: string;
  liveShowTitle: string;
  queueNotes: string;
  acceptTrades: boolean;
  /** Marketplace buy-now listings — buyers can submit offers on the PDP. */
  allowOffers: boolean;
  /** Marketplace buy-now $500+ — buyers can start layaway with 25% deposit. */
  allowLayaway: boolean;
  vaultedVerification: boolean;
  whiteGlove: boolean;
  escrowProtection: boolean;
  /** AI listing assistant (mock) */
  aiScanCompleted: boolean;
  aiListingTypeRecommendation: ListingCommerceType | null;
  aiSuggestedPrice: string;
  aiPriceReasoning: string;
  aiComparableSalesPlaceholder: string;
  aiShippingWeightCategory: string;
  sellerConfirmedShippingTier: boolean;
  aiNeedsSellerConfirmation: boolean;
  aiReviewReasons: string[];
  aiFieldBadges: Partial<Record<AiTrackedField, AiFieldConfidence>>;
  aiAuthenticationVisible: boolean;
  verificationSource: VerificationSource;
  aiAcknowledgedReviews: boolean;
};

/** Preset auction lengths for live show timed auctions (full days). */
export const AUCTION_DURATION_DAY_OPTIONS = [3, 5, 7, 10, 14, 30] as const;

function pickClosestAuctionDays(n: number): (typeof AUCTION_DURATION_DAY_OPTIONS)[number] {
  let best: (typeof AUCTION_DURATION_DAY_OPTIONS)[number] = 7;
  let dist = Infinity;
  for (const d of AUCTION_DURATION_DAY_OPTIONS) {
    const x = Math.abs(d - n);
    if (x < dist) {
      dist = x;
      best = d;
    }
  }
  return best;
}

/** Maps drafts (including legacy `auctionDurationHours`) to an allowed day preset. */
export function normalizeAuctionDurationDays(
  form: Partial<CreateListingFormState> & { auctionDurationHours?: string },
): string {
  const allowed = new Set<number>(AUCTION_DURATION_DAY_OPTIONS as unknown as number[]);
  const dayRaw = form.auctionDurationDays;
  if (dayRaw != null && String(dayRaw).trim() !== '') {
    const n = Number(String(dayRaw).trim());
    if (allowed.has(n)) return String(n);
  }
  const legacyH = form.auctionDurationHours;
  if (legacyH != null && String(legacyH).trim() !== '') {
    const h = Number(legacyH);
    if (Number.isFinite(h) && h > 0) {
      return String(pickClosestAuctionDays(Math.round(h / 24)));
    }
  }
  return '7';
}

export const emptyCreateListingForm = (): CreateListingFormState => ({
  listingChannel: null,
  media: [],
  listingType: null,
  category: null,
  subcategories: [],
  title: '',
  description: '',
  condition: '',
  authentication: '',
  brand: '',
  referenceNumber: '',
  year: '',
  grade: '',
  accessories: '',
  shippingNotes: '',
  buyNowPrice: '',
  startingBid: '',
  reservePrice: '',
  auctionDurationDays: '7',
  breakSpots: '30',
  spotPrice: '',
  breakFormat: 'Random teams',
  tradeInterests: '',
  tradeWishlist: '',
  shippingMethod: '',
  packageWeightLb: '',
  packageWeightOz: '',
  packageLengthIn: '',
  packageWidthIn: '',
  packageHeightIn: '',
  shipFromZip: '',
  shipToZip: '',
  shippingHandlingFee: '',
  selectedShippoRate: null,
  marketplaceShippingOfferScope: 'all',
  marketplaceAllowedRateKeys: [],
  marketplaceRatesPreviewOk: false,
  marketplaceOfferableRateCount: 0,
  insurance: false,
  signature: true,
  international: false,
  featureInLive: false,
  selectedLiveShowId: null,
  liveShippingPreset: 'simplified',
  liveShippingProfileId: 'card_single',
  liveBundleEligible: true,
  liveShipFromZip: '',
  liveShipInternational: true,
  liveHandlingSurcharge: '',
  liveAdvancedWeightLb: '',
  liveAdvancedLengthIn: '',
  liveAdvancedWidthIn: '',
  liveAdvancedHeightIn: '',
  liveShowTitle: '',
  queueNotes: '',
  acceptTrades: true,
  allowOffers: false,
  allowLayaway: false,
  vaultedVerification: false,
  whiteGlove: false,
  escrowProtection: true,
  tags: '',
  aiScanCompleted: false,
  aiListingTypeRecommendation: null,
  aiSuggestedPrice: '',
  aiPriceReasoning: '',
  aiComparableSalesPlaceholder: '',
  aiShippingWeightCategory: '',
  sellerConfirmedShippingTier: false,
  aiNeedsSellerConfirmation: false,
  aiReviewReasons: [],
  aiFieldBadges: {},
  aiAuthenticationVisible: false,
  verificationSource: 'none',
  aiAcknowledgedReviews: false,
});
