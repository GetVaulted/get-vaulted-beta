import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { DisputeContextType, SupportCategory } from '../platform/types';
import { rootNavigationRef } from './rootNavigationRef';
import type { RootStackParamList } from './types';

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

export function openUserProfile(userId: string, navigation?: { navigate: RootNav['navigate'] }) {
  if (navigation) {
    (navigation as RootNav).navigate('UserProfile', { userId });
    return;
  }
  if (rootNavigationRef.isReady()) rootNavigationRef.navigate('UserProfile', { userId });
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
