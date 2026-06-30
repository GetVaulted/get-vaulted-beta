/** Flip to `true` when the Vault AI listing assistant is ready to ship again. */
export const MARKETPLACE_LISTING_AI_ENABLED = false;

/** Flip to `true` when marketplace comps support pricing suggestions. */
export const LISTING_PRICING_ASSISTANT_ENABLED = false;

export function marketplaceListingAiEnabled(isLiveShow: boolean): boolean {
  return !isLiveShow && MARKETPLACE_LISTING_AI_ENABLED;
}

export function listingPricingAssistantEnabled(isLiveShow: boolean): boolean {
  return !isLiveShow && LISTING_PRICING_ASSISTANT_ENABLED;
}
