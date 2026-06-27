import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { rootNavigationRef } from './rootNavigationRef';
import type { RootStackParamList } from './types';

type RootNav = NavigationProp<RootStackParamList>;

export function openMessagesInbox(navigation?: NavigationProp<ParamListBase>) {
  if (navigation) {
    (navigation as RootNav).navigate('MessagesInbox');
    return;
  }
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('MessagesInbox');
  }
}

export function openMessageThread(
  navigation: NavigationProp<ParamListBase> | undefined,
  threadId: string,
) {
  if (navigation) {
    (navigation as RootNav).navigate('MessageThread', { threadId });
    return;
  }
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('MessageThread', { threadId });
  }
}

export function openMessageSellerForListing(
  navigation: NavigationProp<ParamListBase>,
  params: { listingId: string; initialDraft?: string },
) {
  (navigation as RootNav).navigate('MessageCompose', params);
}

export function openMessageSellerFromLive(params: {
  liveRoomId: string;
  listingId?: string;
  sellerUsername?: string;
}) {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('MessageCompose', params);
  }
}
