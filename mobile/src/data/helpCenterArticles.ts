export type HelpSectionId =
  | 'buying'
  | 'selling'
  | 'live'
  | 'marketplace'
  | 'shipping'
  | 'payments'
  | 'trades'
  | 'disputes'
  | 'account'
  | 'trust';

export type HelpArticle = {
  id: string;
  sectionId: HelpSectionId;
  title: string;
  summary: string;
  body: string;
  keywords: string[];
};

export const HELP_SECTIONS: { id: HelpSectionId; title: string }[] = [
  { id: 'buying', title: 'Buying' },
  { id: 'selling', title: 'Selling' },
  { id: 'live', title: 'Live Shows' },
  { id: 'marketplace', title: 'Marketplace Listings' },
  { id: 'shipping', title: 'Shipping' },
  { id: 'payments', title: 'Payments & Payouts' },
  { id: 'trades', title: 'Trades' },
  { id: 'disputes', title: 'Disputes' },
  { id: 'account', title: 'Account' },
  { id: 'trust', title: 'Trust & Safety' },
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'buy-1',
    sectionId: 'buying',
    title: 'How buying works on Get Vaulted',
    summary: 'Browse The Vault, join live rooms, and complete secure checkout.',
    body: 'Get Vaulted connects verified collectors, live sellers, and marketplace inventory. Purchases may happen in The Vault (async listings) or during live shows. Always review seller ratings, authentication badges, and shipping terms before you buy.',
    keywords: ['buy', 'purchase', 'checkout', 'vault'],
  },
  {
    id: 'sell-1',
    sectionId: 'selling',
    title: 'Seller Studio overview',
    summary: 'Inventory, Vault Events, and payouts from one command center.',
    body: 'Approved sellers use Seller Studio for inventory, revenue, and fulfillment. Schedule Vault Events from the Vault Events hub, then run each show from its Command Center. Connect payouts before going live.',
    keywords: ['seller', 'studio', 'hq', 'payout'],
  },
  {
    id: 'live-1',
    sectionId: 'live',
    title: 'Joining a live room',
    summary: 'Real-time auctions, drops, and chat in collector rooms.',
    body: 'Tap any live room card to enter. Guests can browse; an account is required to bid, buy, or trade. Live inventory is tied to the host’s queue and may sell quickly.',
    keywords: ['live', 'room', 'auction', 'bid'],
  },
  {
    id: 'mkt-1',
    sectionId: 'marketplace',
    title: 'Marketplace listings',
    summary: 'Async inventory in The Vault with verified lanes.',
    body: 'Listings support buy-now, offers, and vault-verified authentication where applicable. Use category lanes to filter sports cards, sneakers, watches, and more.',
    keywords: ['marketplace', 'listing', 'vault', 'inventory'],
  },
  {
    id: 'ship-1',
    sectionId: 'shipping',
    title: 'Shipping & labels',
    summary: 'Protected labels and tracking on trades and orders.',
    body: 'Sellers generate shipping labels through Get Vaulted’s protected flow. Tracking updates appear on your order or trade detail screen. Report shipping issues via Contact Support.',
    keywords: ['shipping', 'label', 'tracking', 'delivery'],
  },
  {
    id: 'pay-1',
    sectionId: 'payments',
    title: 'Payments & payouts',
    summary: 'Secure checkout for buyers; Stripe payouts for sellers.',
    body: 'Buyers pay through Get Vaulted’s secure checkout. Sellers connect a payout account in Seller Studio → Revenue before withdrawing. Payout timing depends on your bank and Stripe.',
    keywords: ['payment', 'payout', 'stripe', 'wallet'],
  },
  {
    id: 'trade-1',
    sectionId: 'trades',
    title: 'Vault-to-vault trades',
    summary: 'Protected offers, counters, and trade fees.',
    body: 'Trade Center is your collector negotiation hub. Send offers on listings, counter, and accept trades with bundled protection and labels. Active trades must be completed before account deletion.',
    keywords: ['trade', 'offer', 'counter', 'vault'],
  },
  {
    id: 'disp-1',
    sectionId: 'disputes',
    title: 'Opening a dispute',
    summary: 'Serious issues with orders, trades, or live purchases.',
    body: 'Disputes are for significant problems: non-delivery, authenticity concerns, or damaged items. Open a dispute from your order or trade detail. Our team reviews evidence and updates a protected timeline.',
    keywords: ['dispute', 'refund', 'authenticity', 'problem'],
  },
  {
    id: 'acct-1',
    sectionId: 'account',
    title: 'Manage your account',
    summary: 'Profile, email, password, and deletion.',
    body: 'Go to Settings → Account to edit your profile, change credentials, or delete your account. Deletion is permanent after confirmation and may be blocked while trades or disputes are open.',
    keywords: ['account', 'profile', 'password', 'delete'],
  },
  {
    id: 'trust-1',
    sectionId: 'trust',
    title: 'Trust & safety',
    summary: 'Verification, reviews, and reporting.',
    body: 'Vault Verified inventory, seller ratings, and trade completion rates build collector trust. Report users via Contact Support. Block and follow tools help you curate your network.',
    keywords: ['trust', 'verified', 'report', 'safety', 'review'],
  },
];

export function searchHelpArticles(query: string): HelpArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return HELP_ARTICLES;
  return HELP_ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.keywords.some((k) => k.includes(q)),
  );
}
