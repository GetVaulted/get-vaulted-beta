import { rootNavigationRef } from './rootNavigationRef';

export function openSellerListingManagement(listingId: string) {
  if (!listingId.trim()) return;
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SellerListingManagement', { listingId });
  }
}
