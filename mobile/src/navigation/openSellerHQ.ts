import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { SellerHubTabId } from '../data/sellerHubMock';
import { rootNavigationRef } from './rootNavigationRef';

let pendingSellerHQTab: SellerHubTabId | null = null;

export function setPendingSellerHQTab(tab: SellerHubTabId | null) {
  pendingSellerHQTab = tab;
}

export function consumePendingSellerHQTab(): SellerHubTabId | null {
  const tab = pendingSellerHQTab;
  pendingSellerHQTab = null;
  return tab;
}

/** Open the Seller HQ tab (optionally focus a sub-tab). Works from tab screens, nested stacks, or root ref. */
export function openSellerHQ(
  navigation?: NavigationProp<ParamListBase>,
  opts?: { tab?: SellerHubTabId },
) {
  if (opts?.tab) setPendingSellerHQTab(opts.tab);

  if (navigation && 'navigate' in navigation) {
    try {
      (navigation as NavigationProp<ParamListBase>).navigate('HQ');
      return;
    } catch {
      /* not inside main tabs — fall through */
    }
  }

  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('MainTabs', { screen: 'HQ' });
  }
}
