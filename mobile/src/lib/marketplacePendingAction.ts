export type MarketplacePendingAction = 'buy_now' | 'make_offer' | 'layaway' | 'trade';

let pendingListingAction: { listingId: string; action: MarketplacePendingAction } | null = null;

export function setPendingMarketplaceListingAction(listingId: string, action: MarketplacePendingAction) {
  pendingListingAction = { listingId, action };
}

export function consumePendingMarketplaceListingAction(
  listingId: string,
): MarketplacePendingAction | null {
  if (!pendingListingAction || pendingListingAction.listingId !== listingId) return null;
  const action = pendingListingAction.action;
  pendingListingAction = null;
  return action;
}
