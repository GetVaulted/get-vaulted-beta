import { LISTING_PRICING_ASSISTANT_ENABLED } from './listingAiAssistantEnabled';
import type { CreateListingFormState, ListingCommerceType } from './types';

/**
 * Optional media assist — returns only high-confidence suggestions.
 * Uses draft context until vision recognition is wired server-side.
 */
export function buildMockAiListingScan(form: CreateListingFormState): Partial<CreateListingFormState> {
  if (form.media.length === 0) return {};

  const patch: Partial<CreateListingFormState> = {};

  if (form.listingType == null) {
    const recommended: ListingCommerceType =
      form.listingChannel === 'live_show' ? 'auction' : form.listingChannel === 'marketplace' ? 'buy_now' : 'buy_now';
    patch.aiListingTypeRecommendation = recommended;
  }

  if (form.category && !form.title.trim()) {
    const categoryLabel = form.category.replace(/_/g, ' ');
    patch.title = `${categoryLabel.charAt(0).toUpperCase()}${categoryLabel.slice(1)} listing`;
    patch.aiFieldBadges = { ...form.aiFieldBadges, title: 'ai_suggestion' };
  }

  if (
    LISTING_PRICING_ASSISTANT_ENABLED &&
    form.listingChannel === 'marketplace' &&
    !form.buyNowPrice.trim()
  ) {
    patch.aiSuggestedPrice = '149';
    patch.aiPriceReasoning = 'Starter ask based on similar marketplace listings — adjust before publishing.';
  }

  return patch;
}
