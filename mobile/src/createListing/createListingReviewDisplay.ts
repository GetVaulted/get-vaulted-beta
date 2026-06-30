import type { CreateListingFormState, ListingCommerceType } from './types';
import { LISTING_MIN_PHOTOS, LIVE_INVENTORY_PHOTOS } from './types';
import type { CreateListingStackParamList } from '../navigation/types';

/** Coerce optional / legacy draft values before string ops (.trim, .replace). */
export function asListingString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/** Parse a currency-ish string to USD number; returns 0 when empty or invalid. */
export function parseListingPriceUsd(value: unknown): number {
  const raw = asListingString(value).replace(/[^0-9.]/g, '');
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Primary buy-now amount used for layaway eligibility and marketplace pricing. */
export function resolveBuyNowPriceUsd(form: Partial<CreateListingFormState>): number {
  return parseListingPriceUsd(form.buyNowPrice);
}

/** Sale amount entered on the pricing step (by listing type). */
export function resolvePricingItemPriceUsd(form: Partial<CreateListingFormState>): number {
  const type = form.listingType;
  if (type === 'buy_now' || type === 'vault_drop') return parseListingPriceUsd(form.buyNowPrice);
  if (type === 'auction' || type === 'live_auction') return parseListingPriceUsd(form.startingBid);
  if (type === 'break_spot') return parseListingPriceUsd(form.spotPrice);
  return 0;
}

export function isLayawayPriceEligible(form: Partial<CreateListingFormState>): boolean {
  if (form.listingType !== 'buy_now' && form.listingType !== 'vault_drop') return false;
  return resolveBuyNowPriceUsd(form) >= 500;
}

export function resolveSellerDisplayPrice(form: Partial<CreateListingFormState>): string {
  const type = form.listingType;
  if (type === 'trade_only') return 'Trade lane';
  const buyNow = asListingString(form.buyNowPrice).trim();
  const starting = asListingString(form.startingBid).trim();
  const spot = asListingString(form.spotPrice).trim();
  return buyNow || starting || spot || '—';
}

export function listingSubcategories(form: Partial<CreateListingFormState>): string[] {
  if (!Array.isArray(form.subcategories)) return [];
  return form.subcategories.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

export function listingPhotoUri(form: Partial<CreateListingFormState>): string | null {
  const uri = form.media?.[0]?.uri;
  return typeof uri === 'string' && uri.trim() ? uri : null;
}

export type CreateListingReviewIssue = {
  severity: 'error' | 'warning';
  message: string;
  screen: keyof CreateListingStackParamList;
};

export function getCreateListingReviewIssues(
  form: Partial<CreateListingFormState>,
  opts: { photoCount: number; isLiveShow: boolean },
): CreateListingReviewIssue[] {
  const issues: CreateListingReviewIssue[] = [];

  if (!form.listingType) {
    issues.push({ severity: 'error', message: 'Choose a listing type.', screen: 'CreateListingType' });
  }
  if (!form.category) {
    issues.push({ severity: 'error', message: 'Choose a category.', screen: 'CreateListingCategory' });
  }
  if (!asListingString(form.title).trim()) {
    issues.push({ severity: 'error', message: 'Add a listing title.', screen: 'CreateListingDetails' });
  }
  if (opts.isLiveShow) {
    if (opts.photoCount !== LIVE_INVENTORY_PHOTOS) {
      issues.push({
        severity: 'error',
        message: 'Upload 1 thumbnail image.',
        screen: 'CreateListingMedia',
      });
    }
  } else if (opts.photoCount < LISTING_MIN_PHOTOS) {
    issues.push({
      severity: 'error',
      message: `Add at least ${LISTING_MIN_PHOTOS} photos.`,
      screen: 'CreateListingMedia',
    });
  }

  const t = form.listingType;
  if (t === 'buy_now' || t === 'vault_drop') {
    if (!asListingString(form.buyNowPrice).trim()) {
      issues.push({ severity: 'error', message: 'Set a buy-now price.', screen: 'CreateListingPricing' });
    }
  } else if (t === 'auction' || t === 'live_auction') {
    if (!asListingString(form.startingBid).trim()) {
      issues.push({ severity: 'error', message: 'Set a starting bid.', screen: 'CreateListingPricing' });
    }
  } else if (t === 'break_spot') {
    if (!asListingString(form.spotPrice).trim()) {
      issues.push({ severity: 'error', message: 'Set a spot price.', screen: 'CreateListingPricing' });
    }
  } else if (t === 'trade_only') {
    if (!asListingString(form.tradeInterests).trim()) {
      issues.push({ severity: 'error', message: 'Describe trade interests.', screen: 'CreateListingPricing' });
    }
  }

  if (!asListingString(form.description).trim()) {
    issues.push({
      severity: 'warning',
      message: 'Description not provided — buyers see less detail.',
      screen: 'CreateListingDetails',
    });
  }

  return issues;
}

export function commerceTypeLabel(type: ListingCommerceType | null | undefined): string {
  if (!type) return 'Not provided';
  switch (type) {
    case 'buy_now':
      return 'Buy Now';
    case 'auction':
      return 'Auction';
    case 'live_auction':
      return 'Live Auction';
    case 'break_spot':
      return 'Break Spot';
    case 'vault_drop':
      return 'Vault Drop';
    case 'trade_only':
      return 'Trade Only';
    default:
      return 'Not provided';
  }
}
