import type { TradeItem } from '../trade/tradeDisplayTypes';
import type { ListingLite } from '../types/tradeOffers';

export function listingToTradeItem(l: ListingLite): TradeItem {
  const img = typeof l.media_urls === 'string' ? l.media_urls : '';
  const vaulted =
    l.authentication_status === 'vaulted_verified' || l.authentication_status?.toLowerCase().includes('vaulted');
  return {
    id: l.id,
    title: l.title,
    imageUrl: img || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400',
    conditionGrade: l.condition ?? '—',
    estValue: l.price > 0 ? `$${l.price.toLocaleString()}` : '—',
    authStatus: l.authentication_status,
    vaultedVerified: vaulted,
  };
}
