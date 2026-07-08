import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { fetchProfileIdByUsername } from '../api/profilesRepository';
import type { DisputeContextType, SupportCategory } from '../platform/types';
import { rootNavigationRef } from './rootNavigationRef';
import type { RootStackParamList } from './types';

function isLikelyPlatformUserId(value: string): boolean {
  const v = value.trim();
  return v.length >= 20 && /^c[a-z0-9]+$/i.test(v);
}

type RootNav = NavigationProp<RootStackParamList>;

export function openSettings(navigation?: { navigate: RootNav['navigate'] }) {
  if (navigation) {
    (navigation as RootNav).navigate('Settings');
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('Settings');
}

export function openHelpCenter(navigation?: { navigate: RootNav['navigate'] }, focusSearch?: boolean) {
  const params = focusSearch ? { focusSearch: true } : undefined;
  if (navigation) {
    (navigation as RootNav).navigate('HelpCenter', params);
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('HelpCenter', params);
}

export function openVaultSearch(navigation?: { navigate: RootNav['navigate'] }, initialQuery?: string) {
  const params = initialQuery?.trim() ? { initialQuery: initialQuery.trim() } : undefined;
  if (navigation) {
    (navigation as RootNav).navigate('VaultSearch', params);
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('VaultSearch', params);
}

export function openUserProfile(userId: string, navigation?: { navigate: RootNav['navigate'] }) {
  if (navigation) {
    (navigation as RootNav).navigate('UserProfile', { userId });
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('UserProfile', { userId });
}

export function openSellerShop(
  sellerId: string,
  navigation?: { navigate: RootNav['navigate'] },
  opts?: { tab?: 'all' | 'buy_now' | 'auctions' | 'sold' },
) {
  const params: RootStackParamList['SellerShop'] = { sellerId };
  if (opts?.tab && opts.tab !== 'all') params.tab = opts.tab;
  if (navigation) {
    (navigation as RootNav).navigate('SellerShop', params);
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('SellerShop', params);
}

export function openFollowersFollowing(
  navigation?: { navigate: RootNav['navigate'] },
  tab: 'followers' | 'following' = 'followers',
) {
  const params = { tab };
  if (navigation) {
    (navigation as RootNav).navigate('FollowersFollowing', params);
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('FollowersFollowing', params);
}

/** Open a live show host profile from buyer console (id preferred; username fallback). */
export async function openLiveHostProfile(
  args: { hostUserId?: string; hostUsername?: string },
  navigation?: { navigate: RootNav['navigate'] },
) {
  const hostUserId = args.hostUserId?.trim();
  if (hostUserId && isLikelyPlatformUserId(hostUserId)) {
    openUserProfile(hostUserId, navigation);
    return;
  }
  const username = (args.hostUsername ?? hostUserId)?.replace(/^@+/, '').trim();
  if (!username) return;
  const profileId = await fetchProfileIdByUsername(username);
  if (profileId) openUserProfile(profileId, navigation);
}

export function openContactSupport(
  params?: {
    category?: SupportCategory;
    referenceType?: string;
    referenceId?: string;
  },
  navigation?: { navigate: RootNav['navigate'] },
) {
  if (navigation) {
    (navigation as RootNav).navigate('ContactSupport', params);
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('ContactSupport', params);
}

export function openSupportInbox(navigation?: { navigate: RootNav['navigate'] }) {
  if (navigation) {
    (navigation as RootNav).navigate('SupportInbox');
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('SupportInbox');
}

export function openDispute(
  params: {
    contextType: DisputeContextType;
    referenceId?: string;
  },
  navigation?: { navigate: RootNav['navigate'] },
) {
  if (navigation) {
    (navigation as RootNav).navigate('OpenDispute', params);
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('OpenDispute', params);
}

export function openDisputeDetail(disputeId: string, navigation?: { navigate: RootNav['navigate'] }) {
  if (navigation) {
    (navigation as RootNav).navigate('DisputeDetail', { disputeId });
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('DisputeDetail', { disputeId });
}

export function openWriteReview(
  params: {
    reviewType: import('../platform/types').ReviewType;
    referenceId: string;
    subjectUserId: string;
    subjectDisplayName?: string;
  },
  navigation?: { navigate: RootNav['navigate'] },
) {
  if (navigation) {
    (navigation as RootNav).navigate('WriteReview', params);
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('WriteReview', params);
}

export function openVaultComms(navigation?: { navigate: RootNav['navigate'] }) {
  if (navigation) {
    (navigation as RootNav).navigate('VaultComms');
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('VaultComms');
}

export function openNotificationInbox(navigation?: { navigate: RootNav['navigate'] }) {
  if (navigation) {
    (navigation as RootNav).navigate('NotificationInbox');
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('NotificationInbox');
}

export function openHelpArticle(articleId: string, navigation?: { navigate: RootNav['navigate'] }) {
  if (navigation) {
    (navigation as RootNav).navigate('HelpArticle', { articleId });
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('HelpArticle', { articleId });
}

export function openMyOrders(navigation?: { navigate: RootNav['navigate'] }) {
  if (navigation) {
    (navigation as RootNav).navigate('BuyerOrders');
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('BuyerOrders');
}

/** @deprecated use openSettings */
export function openProfileSettings(navigation?: NavigationProp<ParamListBase>) {
  openSettings(navigation as { navigate: RootNav['navigate'] });
}
