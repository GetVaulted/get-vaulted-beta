import { getSupabase } from '../lib/supabase';
import { normalizeCategoryId, type CategoryId, type Host, type Product } from '../types';

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  verified_status: string | null;
};

function formatMoney(amount: number, currency: string): string {
  const cur = (currency || 'usd').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(
      amount,
    );
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

export function mapListingCategoryToCategoryId(raw: string | null | undefined): CategoryId {
  const normalized = normalizeCategoryId((raw ?? '').trim().toLowerCase());
  if (normalized) return normalized;

  const s = (raw ?? '').toLowerCase();
  if (s.includes('other collectible')) return 'other';
  if (s.includes('apparel') || s.includes('fashion')) return 'other';
  if (s.includes('trading') || s.includes('tcg') || s.includes('pokemon') || s.includes('yugioh')) return 'cards';
  if (s.includes('sealed') || s.includes('hobby') || s === 'wax') return 'cards';
  if (s === 'breaks' || s === 'break') return 'cards';
  if (s.includes('card') || s.includes('slab') || s.includes('psa') || s === 'trade_qa') return 'cards';
  if (s.includes('sneaker') || s.includes('footwear')) return 'sneakers';
  if (s.includes('watch')) return 'watches';
  if (s.includes('memo') || s.includes('jersey') || s.includes('game') || s.includes('sport')) return 'memorabilia';
  if (
    s.includes('electronic') ||
    s.includes('tech') ||
    s.includes('phone') ||
    s.includes('tablet') ||
    s.includes('laptop') ||
    s.includes('console') ||
    s.includes('gaming pc')
  ) {
    return 'other';
  }
  if (s === 'art / other' || s.startsWith('art') || s.includes('other')) return 'other';
  return 'luxury';
}

function profileToHost(id: string, p?: ProfileRow): Host {
  const name = p?.display_name?.trim() || p?.username?.trim() || 'Seller';
  const handle = p?.username?.trim() ? `@${p.username.trim()}` : '@seller';
  return {
    id,
    name,
    handle,
    avatarUrl:
      p?.avatar_url?.trim() ||
      'https://images.unsplash.com/photo-1517649763962-0c62306601b7?w=200&q=80&auto=format&fit=crop',
    verified: p?.verified_status === 'verified',
    followers: '—',
  };
}

function rowToProduct(row: Record<string, unknown>, seller?: ProfileRow): Product {
  const media = row.media_urls as unknown;
  const first =
    Array.isArray(media) && typeof media[0] === 'string' && (media[0] as string).length > 0 ? (media[0] as string) : undefined;
  const cat = mapListingCategoryToCategoryId(row.category as string);
  const price = Number(row.price ?? 0);
  const currency = (row.currency as string) || 'usd';
  const auth = (row.authentication_status as string) || 'unknown';
  return {
    id: row.id as string,
    title: (row.title as string) || 'Listing',
    category: cat,
    imageGradient: ['#06080c', '#10141c'] as [string, string],
    imageUrl: first,
    storyline: (row.description as string)?.slice(0, 120) || undefined,
    vaultVerified: auth === 'vaulted_verified',
    listingPrice: formatMoney(Number.isFinite(price) ? price : 0, currency),
    conditionGrade: (row.grade as string) || (row.condition as string) || undefined,
    seller: profileToHost(row.seller_id as string, seller),
    buyNow: formatMoney(Number.isFinite(price) ? price : 0, currency),
  };
}

async function fetchProfilesMap(sb: NonNullable<ReturnType<typeof getSupabase>>, ids: string[]) {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return new Map<string, ProfileRow>();
  const { data, error } = await sb.from('profiles').select('id, username, display_name, avatar_url, verified_status').in('id', uniq);
  if (error || !data) return new Map();
  const m = new Map<string, ProfileRow>();
  for (const row of data as ProfileRow[]) {
    m.set(row.id, row);
  }
  return m;
}

export async function fetchMarketplaceListings(opts?: {
  category?: CategoryId;
  limit?: number;
}): Promise<Product[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const lim = Math.min(Math.max(opts?.limit ?? 32, 1), 60);
  const { data, error } = await sb
    .from('listings')
    .select('id, seller_id, title, description, category, price, currency, authentication_status, media_urls, condition, grade, status')
    .eq('status', 'live')
    .order('created_at', { ascending: false })
    .limit(lim * 2);
  if (error || !data?.length) {
    if (error) console.warn('fetchMarketplaceListings', error.message);
    return [];
  }
  const filtered = opts?.category
    ? (data as Record<string, unknown>[]).filter((r) => mapListingCategoryToCategoryId(r.category as string) === opts.category)
    : (data as Record<string, unknown>[]);
  const rows = filtered.slice(0, lim);
  if (!rows.length) return [];
  const sellerIds = rows.map((r) => r.seller_id as string);
  const profiles = await fetchProfilesMap(sb, sellerIds);
  return rows.map((r) => rowToProduct(r, profiles.get(r.seller_id as string)));
}

export async function fetchMarketplaceListingById(listingId: string): Promise<Product | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('listings')
    .select(
      'id, seller_id, title, description, category, price, currency, authentication_status, media_urls, condition, grade, status',
    )
    .eq('id', listingId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('fetchMarketplaceListingById', error.message);
    return null;
  }
  const row = data as Record<string, unknown>;
  if ((row.status as string) !== 'live') return null;
  const sellerId = row.seller_id as string;
  const profiles = await fetchProfilesMap(sb, [sellerId]);
  return rowToProduct(row, profiles.get(sellerId));
}

/** Retry briefly after publish — avoids empty Product detail on first paint. */
export async function fetchMarketplaceListingByIdWithRetry(
  listingId: string,
  opts?: { attempts?: number; delayMs?: number },
): Promise<Product | null> {
  const attempts = Math.max(1, opts?.attempts ?? 4);
  const delayMs = opts?.delayMs ?? 350;
  for (let i = 0; i < attempts; i++) {
    const product = await fetchMarketplaceListingById(listingId);
    if (product) return product;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

export async function fetchListingsBySeller(opts: {
  sellerId: string;
  excludeListingId?: string;
  limit?: number;
}): Promise<Product[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const lim = Math.min(Math.max(opts.limit ?? 12, 1), 24);
  let q = sb
    .from('listings')
    .select('id, seller_id, title, description, category, price, currency, authentication_status, media_urls, condition, grade, status')
    .eq('seller_id', opts.sellerId)
    .eq('status', 'live')
    .order('created_at', { ascending: false })
    .limit(lim + 2);
  const { data, error } = await q;
  if (error || !data?.length) {
    if (error) console.warn('fetchListingsBySeller', error.message);
    return [];
  }
  let rows = data as Record<string, unknown>[];
  if (opts.excludeListingId) {
    rows = rows.filter((r) => r.id !== opts.excludeListingId);
  }
  rows = rows.slice(0, lim);
  if (!rows.length) return [];
  const profiles = await fetchProfilesMap(sb, [opts.sellerId]);
  const seller = profiles.get(opts.sellerId);
  return rows.map((r) => rowToProduct(r, seller));
}
