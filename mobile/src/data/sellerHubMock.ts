import type { ListingPreview } from '../createListing/types';
import type { CategoryId } from '../types';

export type { ListingPreview };

export type SellerHubTabId =
  | 'overview'
  | 'listings'
  | 'live'
  | 'orders'
  | 'wallet'
  | 'analytics'
  | 'vault';

export const SELLER_HUB_TABS: { id: SellerHubTabId; label: string }[] = [
  { id: 'overview', label: 'Studio' },
  { id: 'listings', label: 'Inventory' },
  { id: 'live', label: 'Vault Events' },
  { id: 'orders', label: 'Fulfillment' },
  { id: 'wallet', label: 'Revenue' },
  { id: 'analytics', label: 'Insights' },
  { id: 'vault', label: 'Identity' },
];

export type SellerProfileMock = {
  displayName: string;
  handle: string;
  avatarUrl: string;
  verified: boolean;
  followers: string;
  rating: string;
  bio: string;
  specialties: string[];
  isLiveNow: boolean;
  upcomingShowTitle: string;
  upcomingShowStarts: string;
};

export const sellerProfile: SellerProfileMock = {
  displayName: 'Seller name',
  handle: '@yourhandle',
  avatarUrl: '',
  verified: false,
  followers: '—',
  rating: '—',
  bio: 'Complete your seller profile and connect listings to appear in discovery.',
  specialties: [],
  isLiveNow: false,
  upcomingShowTitle: '',
  upcomingShowStarts: '',
};

export const listingPreviews: ListingPreview[] = [];

export type LiveShowRow = {
  id: string;
  title: string;
  meta: string;
  state: 'upcoming' | 'scheduled' | 'draft' | 'past';
};

export const liveShowRows: LiveShowRow[] = [];

export type OrderRow = {
  id: string;
  buyer: string;
  item: string;
  amount: string;
  state: 'ship' | 'done' | 'dispute' | 'track';
};

export const orderRows: OrderRow[] = [];

export const walletSnapshot = { available: '$0', pending: '$0', lifetime: '$0' };

export const analyticsSnapshot = {
  revenue30: '—',
  viewerGrowth: '—',
  sellThrough: '—',
  topStream: '—',
  engagement: '—',
};

export const listingCounts = { active: 0, drafts: 0, sold: 0, expiring: 0 };
export const liveCounts = { upcoming: 0, scheduled: 0, drafts: 0, past: 0 };
export const orderCounts = { ship: 0, done: 0, disputes: 0, tracking: 0 };

export type VaultWin = {
  id: string;
  label: string;
  grade: string;
  imageUrl: string;
};

export const vaultWins: VaultWin[] = [];

export const liveSellerTools = [
  { id: 't1', label: 'Start Stream', icon: 'radio-outline' as const },
  { id: 't2', label: 'Stream Setup', icon: 'construct-outline' as const },
  { id: 't3', label: 'Auction Queue', icon: 'hammer-outline' as const },
  { id: 't4', label: 'Break Mgmt', icon: 'git-branch-outline' as const },
  { id: 't5', label: 'Giveaways', icon: 'gift-outline' as const },
  { id: 't6', label: 'Pinned Items', icon: 'pin-outline' as const },
  { id: 't7', label: 'Moderators', icon: 'shield-half-outline' as const },
];

export const quickActions = [
  { id: 'q1', label: 'New Listing', icon: 'add-circle-outline' as const },
  { id: 'q2', label: 'Go Live', icon: 'radio-outline' as const },
  { id: 'q3', label: 'Schedule', icon: 'calendar-outline' as const },
  { id: 'q4', label: 'Create Drop', icon: 'flash-outline' as const },
  { id: 'q5', label: 'Withdraw', icon: 'cash-outline' as const },
];

export const streamCategories: { id: CategoryId; label: string }[] = [
  { id: 'cards', label: 'Cards' },
  { id: 'sneakers', label: 'Sneakers' },
  { id: 'memorabilia', label: 'Memorabilia' },
  { id: 'watches', label: 'Watches' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'other', label: 'Other' },
];

export const sellerStudioRows: {
  title: string;
  body: string;
  icon:
    | 'radio-outline'
    | 'calendar-outline'
    | 'cloud-upload-outline'
    | 'storefront-outline'
    | 'cube-outline'
    | 'stats-chart-outline'
    | 'cash-outline'
    | 'construct-outline';
  opensTab?: SellerHubTabId;
}[] = [
  {
    title: 'Start live show',
    body: 'Go live with multi-cam layout, bids, and chat synced.',
    icon: 'radio-outline',
    opensTab: 'live',
  },
  {
    title: 'Schedule live show',
    body: 'Build hype, send reminders, and line up vault drops.',
    icon: 'calendar-outline',
    opensTab: 'live',
  },
  {
    title: 'Create marketplace listing',
    body: 'Permanent storefront discovery — buy now, offers, and trade.',
    icon: 'storefront-outline',
    opensTab: 'listings',
  },
  {
    title: 'Queue live inventory',
    body: 'Fast uploads for upcoming shows, breaks, and on-air auctions.',
    icon: 'radio-outline',
    opensTab: 'listings',
  },
  {
    title: 'Manage inventory',
    body: 'Sync lots to auctions, BIN, and private offers.',
    icon: 'cube-outline',
    opensTab: 'listings',
  },
  {
    title: 'Seller analytics',
    body: 'Retention, average hammer, and audience heatmaps.',
    icon: 'stats-chart-outline',
    opensTab: 'analytics',
  },
  {
    title: 'Wallet & payouts',
    body: 'Payouts, fees, and tax-ready summaries.',
    icon: 'cash-outline',
    opensTab: 'wallet',
  },
  {
    title: 'Stream setup',
    body: 'Lighting presets, capture cards, and latency checks.',
    icon: 'construct-outline',
    opensTab: 'live',
  },
];
