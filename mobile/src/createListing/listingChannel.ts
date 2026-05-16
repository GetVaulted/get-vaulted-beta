import type { ListingCommerceType } from './types';

export type ListingChannel = 'marketplace' | 'live_show';

export type ListingChannelAccent = {
  label: string;
  shortLabel: string;
  icon: 'storefront-outline' | 'radio-outline';
  primary: string;
  primaryMuted: string;
  border: string;
  fill: string;
  gradient: [string, string];
  helper: string;
  futureNote: string;
};

export const LISTING_CHANNEL_CONFIG: Record<ListingChannel, ListingChannelAccent> = {
  marketplace: {
    label: 'Marketplace Listing',
    shortLabel: 'Marketplace',
    icon: 'storefront-outline',
    primary: '#D4AF37',
    primaryMuted: 'rgba(212,175,55,0.65)',
    border: 'rgba(212,175,55,0.45)',
    fill: 'rgba(212,175,55,0.08)',
    gradient: ['rgba(212,175,55,0.14)', 'rgba(12,11,9,0.98)'],
    helper: 'List items for permanent discovery in the Vault marketplace.',
    futureNote: 'After a live show ends, live inventory can convert into marketplace listings.',
  },
  live_show: {
    label: 'Live Show Listing',
    shortLabel: 'Live show',
    icon: 'radio-outline',
    primary: '#FF453A',
    primaryMuted: 'rgba(255,69,58,0.7)',
    border: 'rgba(255,69,58,0.45)',
    fill: 'rgba(255,69,58,0.1)',
    gradient: ['rgba(255,69,58,0.12)', 'rgba(10,8,8,0.98)'],
    helper: 'Prepare inventory for upcoming live shows and auctions.',
    futureNote: 'Pull marketplace listings into a live show queue when you are ready to go on air.',
  },
};

const MARKETPLACE_COMMERCE: ListingCommerceType[] = ['buy_now', 'auction', 'trade_only'];
const LIVE_COMMERCE: ListingCommerceType[] = ['live_auction', 'break_spot', 'vault_drop', 'auction'];

export function commerceOptionsForChannel(channel: ListingChannel | null): ListingCommerceType[] {
  if (channel === 'live_show') return LIVE_COMMERCE;
  if (channel === 'marketplace') return MARKETPLACE_COMMERCE;
  return [...MARKETPLACE_COMMERCE, ...LIVE_COMMERCE];
}

export function stepCountForChannel(_channel: ListingChannel | null): number {
  return 7;
}

export const LISTING_FLOW_STEP = {
  marketplace: {
    media: 0,
    type: 1,
    category: 2,
    details: 3,
    pricing: 4,
    shipping: 5,
    review: 6,
  },
  live_show: {
    media: 0,
    type: 1,
    category: 2,
    details: 3,
    pricing: 4,
    shipping: 5,
    review: 6,
  },
} as const;

export function channelFromPreview(live?: boolean, channel?: ListingChannel): ListingChannel {
  if (channel) return channel;
  return live ? 'live_show' : 'marketplace';
}
