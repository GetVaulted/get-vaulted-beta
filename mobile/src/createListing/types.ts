import type { CategoryId } from '../types';
import type { ListingChannel } from './listingChannel';
import type { ListingShippoRate } from './shippoRates';

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
  status: 'active' | 'draft' | 'sold' | 'expiring' | 'pending' | 'in_auction';
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
  auctionDurationHours: string;
  breakSpots: string;
  spotPrice: string;
  breakFormat: string;
  tradeInterests: string;
  tradeWishlist: string;
  /** @deprecated Use selectedShippoRate — kept for draft migration display. */
  shippingMethod: string;
  packageWeightLb: string;
  packageWeightOz: string;
  packageLengthIn: string;
  packageWidthIn: string;
  packageHeightIn: string;
  shipFromZip: string;
  shippingHandlingFee: string;
  selectedShippoRate: ListingShippoRate | null;
  insurance: boolean;
  signature: boolean;
  international: boolean;
  featureInLive: boolean;
  /** Live show queue — optional link to a scheduled stream. */
  selectedLiveShowId: string | null;
  liveShowTitle: string;
  queueNotes: string;
  acceptTrades: boolean;
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
  auctionDurationHours: '72',
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
  shippingHandlingFee: '',
  selectedShippoRate: null,
  insurance: false,
  signature: true,
  international: false,
  featureInLive: false,
  selectedLiveShowId: null,
  liveShowTitle: '',
  queueNotes: '',
  acceptTrades: true,
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
