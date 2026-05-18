import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { SellerHubTabId } from '../data/sellerHubMock';
import { rootNavigationRef } from './rootNavigationRef';

let pendingSellerHQTab: SellerHubTabId | null = null;
let pendingVaultEventSchedule = false;

export function setPendingSellerHQTab(tab: SellerHubTabId | null) {
  pendingSellerHQTab = tab;
}

export function consumePendingSellerHQTab(): SellerHubTabId | null {
  const tab = pendingSellerHQTab;
  pendingSellerHQTab = null;
  return tab;
}

/** Open schedule modal on next Vault Events tab mount (from Studio quick launch). */
export function setPendingVaultEventSchedule(open = true) {
  pendingVaultEventSchedule = open;
}

export function consumePendingVaultEventSchedule(): boolean {
  const open = pendingVaultEventSchedule;
  pendingVaultEventSchedule = false;
  return open;
}

/** Open the Seller HQ tab (optionally focus a sub-tab). Works from tab screens, nested stacks, or root ref. */
export function openSellerHQ(
  navigation?: NavigationProp<ParamListBase>,
  opts?: { tab?: SellerHubTabId; openSchedule?: boolean },
) {
  if (opts?.tab) setPendingSellerHQTab(opts.tab);
  if (opts?.openSchedule) setPendingVaultEventSchedule(true);

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
