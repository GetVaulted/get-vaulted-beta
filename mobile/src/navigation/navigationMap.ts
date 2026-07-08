/**
 * CTA routing map — every user-facing action should resolve here.
 * Status: `live` = wired, `planned` = hidden/disabled until implemented
 */
export type NavRouteStatus = 'live' | 'planned';

export type NavDestination = {
  route: string;
  params?: Record<string, string | undefined>;
  status: NavRouteStatus;
  notes?: string;
};

export const NAVIGATION_MAP = {
  home: {
    logo: { route: '—', status: 'live' as const, notes: 'Brand only' },
    messagesBell: { route: 'MessagesInbox', status: 'live' as const },
    search: { route: 'HelpCenter', status: 'live' as const, notes: 'Help search entry' },
    cultureHeroLive: { route: 'MainTabs/Live/LiveDiscovery', status: 'live' as const },
    cultureHeroVault: { route: 'MainTabs/Marketplace', status: 'live' as const },
    liveRoomCard: { route: 'MainTabs/Live/LiveRoom', status: 'live' as const },
    marketplaceCard: { route: 'ProductDetail', status: 'live' as const },
    trendingSeller: { route: 'UserProfile', status: 'live' as const },
  },
  marketplace: {
    listing: { route: 'ProductDetail', status: 'live' as const },
    category: { route: '—', status: 'live' as const, notes: 'In-tab filter' },
    search: { route: 'HelpCenter', status: 'live' as const },
  },
  live: {
    roomCard: { route: 'LiveRoom', status: 'live' as const },
    categoryChip: { route: '—', status: 'live' as const, notes: 'Filter' },
    search: { route: 'HelpCenter', status: 'live' as const },
  },
  tradeCenter: {
    startTrade: { route: 'InitiateTrade', status: 'live' as const },
    offerCard: { route: 'ReviewOffer', status: 'live' as const },
    activeTrade: { route: 'TradeDetail', status: 'live' as const },
  },
  sellerHQ: {
    listingCard: { route: 'SellerListingManagement', status: 'live' as const, notes: 'Vault Seller Studio — not ProductDetail' },
    studioRows: { route: 'HQ tabs / Vault Events / listings', status: 'live' as const },
    settingsGear: { route: 'Settings', status: 'live' as const },
    tradeCenterShortcut: { route: 'TradeCenterHome', status: 'live' as const },
    hostRoom: { route: 'SellerHostRoom', status: 'live' as const },
    createListing: { route: 'CreateListingFlow', status: 'live' as const },
    scheduleEvent: { route: 'HQ live tab + modal', status: 'live' as const },
  },
  profile: {
    editProfile: { route: 'ProfileEdit', status: 'live' as const },
    settings: { route: 'Settings', status: 'live' as const },
    publicProfile: { route: 'UserProfile', status: 'live' as const },
  },
  settings: {
    account: { route: 'SettingsAccount', status: 'live' as const },
    helpCenter: { route: 'HelpCenter', status: 'live' as const },
    contactSupport: { route: 'ContactSupport', status: 'live' as const },
    supportInbox: { route: 'SupportInbox', status: 'live' as const },
    signOut: { route: 'LaunchIntro', status: 'live' as const },
    deleteAccount: { route: 'DeleteAccount', status: 'live' as const },
  },
  support: {
    submitTicket: { route: 'SupportInbox', status: 'live' as const },
    openDispute: { route: 'OpenDispute', status: 'live' as const },
  },
  product: {
    buy: { route: 'MessageCompose / checkout', status: 'live' as const },
    trade: { route: 'InitiateTrade', status: 'live' as const },
    sellerProfile: { route: 'SellerShop', status: 'live' as const },
  },
} as const satisfies Record<string, Record<string, NavDestination>>;
