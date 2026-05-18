import { getSupabase } from '../lib/supabase';
import { fetchMarketplaceListings } from './listingsFeedRepository';
import { isMarketplaceDemoProduct } from '../data/marketplaceFeedMock';

export type MarketplaceLiveStats = {
  activeListings: number | null;
  soldToday: number | null;
  endingSoon: number | null;
  completedSales: number | null;
};

type VelocityRpc = {
  sold_today?: number;
  completed_sales?: number;
  active_listings?: number;
};

export async function fetchMarketplaceLiveStats(): Promise<MarketplaceLiveStats> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('marketplace_velocity_stats');
    if (!error && data && typeof data === 'object') {
      const v = data as VelocityRpc;
      const sold = typeof v.sold_today === 'number' ? v.sold_today : null;
      const completed = typeof v.completed_sales === 'number' ? v.completed_sales : null;
      const active = typeof v.active_listings === 'number' ? v.active_listings : null;
      if (sold !== null || completed !== null || active !== null) {
        return {
          activeListings: active,
          soldToday: sold,
          endingSoon: null,
          completedSales: completed,
        };
      }
    }
  }

  const listings = await fetchMarketplaceListings({ limit: 120 });
  const real = listings.filter((p) => !isMarketplaceDemoProduct(p.id));
  if (!real.length) {
    return { activeListings: null, soldToday: null, endingSoon: null, completedSales: null };
  }
  return {
    activeListings: real.length,
    soldToday: null,
    endingSoon: null,
    completedSales: null,
  };
}
