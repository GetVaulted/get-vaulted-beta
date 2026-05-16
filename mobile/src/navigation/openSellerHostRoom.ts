import { Alert } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { navigateToSellerHostRoom, rootNavigationRef } from './rootNavigationRef';

/** From HQ (nested in tabs): open root SellerHostRoom stack screen. */
export function openSellerHostRoom(navigation: NavigationProp<ParamListBase>, roomId: string) {
  const trimmed = roomId.trim();
  if (!trimmed) {
    Alert.alert('Host room', 'This room has no id yet. Refresh your rooms and try again.');
    return;
  }

  const tabNav = navigation.getParent();
  const root = tabNav?.getParent?.() ?? tabNav;
  if (root && 'navigate' in root) {
    (root as NavigationProp<ParamListBase>).navigate('SellerHostRoom', { roomId: trimmed });
    return;
  }

  if (rootNavigationRef.isReady()) {
    navigateToSellerHostRoom(trimmed);
    return;
  }

  Alert.alert('Could not open host room', 'Navigation is not ready yet. Wait a moment and try again.');
}
