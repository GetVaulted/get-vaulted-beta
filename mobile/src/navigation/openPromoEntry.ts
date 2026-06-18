import { rootNavigationRef } from './rootNavigationRef';
import type { RootStackParamList } from './types';
import { promoEntrySlugFromUrl } from '../api/liveGiveawayRepository';

export function openPromoEntry(slugOrUrl: string) {
  const slug = promoEntrySlugFromUrl(slugOrUrl);
  if (!slug) return;
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('PromoEntry', { slug });
  }
}

export type PromoEntryParams = RootStackParamList['PromoEntry'];
