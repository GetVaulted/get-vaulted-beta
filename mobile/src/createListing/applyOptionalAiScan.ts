import type { CreateListingFormState } from './types';

/** Fields the vision pipeline may suggest — only applied when present and non-empty. */
const SUGGESTIBLE_STRING_KEYS = [
  'title',
  'description',
  'condition',
  'authentication',
  'brand',
  'referenceNumber',
  'year',
  'grade',
  'tags',
  'buyNowPrice',
  'startingBid',
  'aiSuggestedPrice',
  'aiPriceReasoning',
  'aiComparableSalesPlaceholder',
  'aiShippingWeightCategory',
] as const;

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** True when the scan returned at least one confident suggestion worth surfacing. */
export function hasConfidentAiSuggestions(patch: Partial<CreateListingFormState>): boolean {
  if (patch.listingType != null || patch.category != null) return true;
  if (Array.isArray(patch.subcategories) && patch.subcategories.length > 0) return true;
  if (patch.aiListingTypeRecommendation != null) return true;
  if (patch.aiNeedsSellerConfirmation) return true;
  if (Array.isArray(patch.aiReviewReasons) && patch.aiReviewReasons.length > 0) return true;

  for (const key of SUGGESTIBLE_STRING_KEYS) {
    if (nonEmptyString(patch[key])) return true;
  }
  return false;
}

/**
 * Merge AI output into the draft without overwriting seller-entered values.
 * Suggestions stay optional — empty scan results leave the form unchanged.
 */
export function applyOptionalAiScanPatch(
  current: CreateListingFormState,
  patch: Partial<CreateListingFormState>
): CreateListingFormState {
  const next: CreateListingFormState = { ...current };

  if (patch.listingType != null && current.listingType == null) {
    next.listingType = patch.listingType;
  }
  if (patch.category != null && current.category == null) {
    next.category = patch.category;
  }
  if (Array.isArray(patch.subcategories) && patch.subcategories.length > 0 && current.subcategories.length === 0) {
    next.subcategories = [...patch.subcategories];
  }
  if (patch.aiListingTypeRecommendation != null && current.aiListingTypeRecommendation == null) {
    next.aiListingTypeRecommendation = patch.aiListingTypeRecommendation;
  }

  for (const key of SUGGESTIBLE_STRING_KEYS) {
    const suggested = patch[key];
    if (!nonEmptyString(suggested)) continue;
    if (!nonEmptyString(current[key])) {
      next[key] = suggested.trim();
    }
  }

  if (patch.aiFieldBadges && Object.keys(patch.aiFieldBadges).length > 0) {
    next.aiFieldBadges = { ...current.aiFieldBadges, ...patch.aiFieldBadges };
  }
  if (typeof patch.aiAuthenticationVisible === 'boolean') {
    next.aiAuthenticationVisible = patch.aiAuthenticationVisible;
  }
  if (patch.verificationSource != null && current.verificationSource === 'none') {
    next.verificationSource = patch.verificationSource;
  }
  if (Array.isArray(patch.aiReviewReasons) && patch.aiReviewReasons.length > 0) {
    next.aiReviewReasons = patch.aiReviewReasons;
  }

  return next;
}
