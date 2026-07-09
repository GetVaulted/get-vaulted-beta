import { getSupabase } from '../lib/supabase';
import { fetchWebApi } from './webListingsRepository';

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

type PublishedScopeMeta = {
  totalListingCount?: number;
};

/** Same total as marketplace browse (`GET /api/listings?scope=published`). */
async function fetchBrowseAlignedActiveCount(): Promise<number | null> {
  try {
    const res = await fetchWebApi('/api/listings?scope=published&pageSize=1');
    const body = (await res.json().catch(() => null)) as PublishedScopeMeta | null;
    if (!res.ok) return null;
    return typeof body?.totalListingCount === 'number' ? body.totalListingCount : null;
  } catch {
    return null;
  }
}

async function fetchVelocityOrderStats(): Promise<{
  soldToday: number | null;
  completedSales: number | null;
  activeListings: number | null;
}> {
  const siteUrl = process.env.EXPO_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  if (siteUrl) {
    try {
      const res = await fetch(`${siteUrl}/api/marketplace/velocity-stats`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const v = (await res.json()) as VelocityRpc;
        return {
          soldToday: typeof v.sold_today === 'number' ? v.sold_today : null,
          completedSales: typeof v.completed_sales === 'number' ? v.completed_sales : null,
          activeListings: typeof v.active_listings === 'number' ? v.active_listings : null,
        };
      }
    } catch {
      /* fall through */
    }
  }

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('marketplace_velocity_stats');
    if (!error && data && typeof data === 'object') {
      const v = data as VelocityRpc;
      return {
        soldToday: typeof v.sold_today === 'number' ? v.sold_today : null,
        completedSales: typeof v.completed_sales === 'number' ? v.completed_sales : null,
        activeListings: typeof v.active_listings === 'number' ? v.active_listings : null,
      };
    }
  }

  return { soldToday: null, completedSales: null, activeListings: null };
}

export async function fetchMarketplaceLiveStats(): Promise<MarketplaceLiveStats> {
  const [browseActive, velocity] = await Promise.all([
    fetchBrowseAlignedActiveCount(),
    fetchVelocityOrderStats(),
  ]);

  const activeListings = browseActive ?? velocity.activeListings;

  if (activeListings !== null || velocity.soldToday !== null || velocity.completedSales !== null) {
    return {
      activeListings,
      soldToday: velocity.soldToday,
      endingSoon: null,
      completedSales: velocity.completedSales,
    };
  }

  return { activeListings: null, soldToday: null, endingSoon: null, completedSales: null };
}
