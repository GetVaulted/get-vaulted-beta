import { fetchWebApi } from './webListingsRepository';
import { mapWebMarketplaceListingToProduct } from './mapWebMarketplaceListing';
import type { WebMarketplaceListing } from './webListingsTypes';
import type { Product } from '../types';

export type SellerShopTab = 'all' | 'buy_now' | 'auctions' | 'sold';

export type SellerShopSeller = {
  id: string;
  username: string;
  name?: string | null;
  image?: string | null;
  verified: boolean;
  credibility: string;
  isOwnShop: boolean;
};

export type SellerShopStats = {
  activeListings: number;
  soldListings: number;
  auctionsLive: number;
  followerCount: number;
  orderCount: number;
};

export type SellerShopResponse = {
  seller: SellerShopSeller;
  stats: SellerShopStats;
  tab: SellerShopTab;
  emptyCopy: string;
  listings: WebMarketplaceListing[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type SellerShopResult = {
  seller: SellerShopSeller;
  stats: SellerShopStats;
  tab: SellerShopTab;
  emptyCopy: string;
  products: Product[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export async function fetchSellerShop(opts: {
  sellerId?: string;
  username?: string;
  tab?: SellerShopTab;
  page?: number;
  pageSize?: number;
  accessToken?: string | null;
}): Promise<SellerShopResult | null> {
  const params = new URLSearchParams();
  if (opts.sellerId?.trim()) params.set('sellerId', opts.sellerId.trim());
  else if (opts.username?.trim()) params.set('username', opts.username.trim());
  else return null;

  if (opts.tab && opts.tab !== 'all') params.set('tab', opts.tab);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize));

  const headers: HeadersInit | undefined = opts.accessToken
    ? { Authorization: `Bearer ${opts.accessToken}` }
    : undefined;
  const res = await fetchWebApi(`/api/sellers/shop?${params.toString()}`, { headers });
  const body = (await res.json().catch(() => null)) as SellerShopResponse | { error?: string } | null;
  if (!res.ok || !body || !('seller' in body)) {
    console.warn('[fetchSellerShop]', res.status, body);
    return null;
  }

  return {
    seller: body.seller,
    stats: body.stats,
    tab: body.tab,
    emptyCopy: body.emptyCopy,
    products: body.listings.map(mapWebMarketplaceListingToProduct),
    page: body.page,
    pageSize: body.pageSize,
    total: body.total,
    hasMore: body.hasMore,
  };
}
