import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { rootNavigationRef } from './rootNavigationRef';

/**
 * Open Vault Seller Studio for a listing (`/seller/listings/:id` on web).
 * Never routes to the buyer ProductDetail screen.
 */
export function openSellerListingManagement(
  listingId: string,
  navigation?: NavigationProp<ParamListBase>,
): void {
  const id = listingId.trim();
  if (!id) return;

  const params = { listingId: id };

  if (navigation?.navigate) {
    navigation.navigate('SellerListingManagement', params);
    return;
  }

  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SellerListingManagement', params);
    return;
  }

  const t = setTimeout(() => {
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('SellerListingManagement', params);
    }
  }, 120);
  void t;
}

/** Resolve root stack from a tab screen (e.g. Seller HQ). */
export function openSellerListingManagementFromTab(
  tabNavigation: NavigationProp<ParamListBase>,
  listingId: string,
): void {
  const tabNav = tabNavigation.getParent?.();
  const root = tabNav?.getParent?.() ?? tabNav;
  if (root && 'navigate' in root) {
    (root as NavigationProp<ParamListBase>).navigate('SellerListingManagement', {
      listingId: listingId.trim(),
    });
    return;
  }
  openSellerListingManagement(listingId);
}
