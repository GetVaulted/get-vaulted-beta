import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { rootNavigationRef } from './rootNavigationRef';
import type { RootStackParamList } from './types';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

/** Open seller order detail from tab screens, nested stacks, or root ref. */
export function openSellerOrderDetail(
  navigation: NavigationProp<ParamListBase> | undefined,
  orderId: string,
) {
  const params = { orderId: orderId.trim() };
  if (!params.orderId) return;

  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SellerOrderDetail', params);
    return;
  }

  if (navigation && 'navigate' in navigation) {
    (navigation as RootNav).navigate('SellerOrderDetail', params);
  }
}
