import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { rootNavigationRef } from './rootNavigationRef';
import type { RootStackParamList } from './types';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

export function openSellerLayaways(
  navigation?: { navigate: RootNav['navigate'] },
  opts?: { layawayId?: string; filter?: 'active' | 'ready' | 'overdue' },
) {
  const nav = navigation as RootNav | undefined;
  if (opts?.layawayId) {
    if (nav) {
      nav.navigate('SellerLayawayDetail', { layawayId: opts.layawayId });
      return;
    }
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('SellerLayawayDetail', { layawayId: opts.layawayId });
    }
    return;
  }
  const params = opts?.filter ? { filter: opts.filter } : undefined;
  if (nav) {
    nav.navigate('SellerLayaways', params);
    return;
  }
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SellerLayaways', params);
  }
}
