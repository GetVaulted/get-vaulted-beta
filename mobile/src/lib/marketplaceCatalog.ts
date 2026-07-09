import { filterCatalogByMarketplaceLane, type MarketplaceLaneId } from '../data/marketplaceCategories';
import { parseListingPriceUsd } from './marketplaceListingQuality';
import type { CategoryId, Product } from '../types';

export function buildMarketplaceCatalog(real: Product[]): Product[] {
  return real;
}

export function filterByCategory(catalog: Product[], category: CategoryId | 'all'): Product[] {
  if (category === 'all') return catalog;
  return catalog.filter((p) => p.category === category);
}

export function filterByMarketplaceLane(catalog: Product[], lane: MarketplaceLaneId): Product[] {
  return filterCatalogByMarketplaceLane(catalog, lane);
}

export type MarketplaceDiscoveryRails = {
  featured: Product[];
  trending: Product[];
  recent: Product[];
  ending: Product[];
  verified: Product[];
  luxury: Product[];
  collector: Product[];
  watched: Product[];
  arrivals: Product[];
};

function priceUsd(product: Product): number {
  return parseListingPriceUsd(product.listingPrice) ?? 0;
}

/** Prefer one listing per category before repeating categories. */
function diversifyByCategory(products: Product[]): Product[] {
  const byCategory = new Map<CategoryId, Product[]>();
  for (const p of products) {
    const bucket = byCategory.get(p.category) ?? [];
    bucket.push(p);
    byCategory.set(p.category, bucket);
  }
  const out: Product[] = [];
  const buckets = [...byCategory.values()];
  let index = 0;
  while (out.length < products.length) {
    let added = false;
    for (const bucket of buckets) {
      const item = bucket[index];
      if (item) {
        out.push(item);
        added = true;
      }
    }
    if (!added) break;
    index += 1;
  }
  return out;
}

function railCap(catalogLength: number, max: number): number {
  if (catalogLength <= 4) return Math.min(max, 2);
  if (catalogLength <= 10) return Math.min(max, 4);
  return max;
}

type RailPicker = (available: Product[]) => Product[];

/**
 * Build discovery rails without repeating the same listing across rows.
 * When the catalog is small, caps each rail so inventory spreads across sections.
 */
export function buildMarketplaceDiscoveryRails(catalog: Product[]): MarketplaceDiscoveryRails {
  const used = new Set<string>();

  const take = (max: number, pick: RailPicker): Product[] => {
    const available = catalog.filter((p) => !used.has(p.id));
    if (!available.length) return [];
    const cap = Math.min(railCap(catalog.length, max), available.length);
    const out: Product[] = [];
    for (const product of pick(available)) {
      if (out.length >= cap) break;
      if (used.has(product.id)) continue;
      used.add(product.id);
      out.push(product);
    }
    return out;
  };

  const ending = pickEndingSoon(catalog.filter((p) => !used.has(p.id)), 7);
  for (const p of ending) used.add(p.id);

  const verified = take(8, (items) => items.filter((p) => p.vaultVerified));
  const luxury = take(7, (items) => items.filter((p) => p.category === 'luxury' || p.category === 'watches'));
  const featured = take(8, (items) => items);
  const trending = take(8, (items) => {
    const tagged = items.filter((p) => p.storyline?.toLowerCase().includes('trending'));
    if (tagged.length) return tagged;
    return [...items].sort((a, b) => priceUsd(b) - priceUsd(a));
  });
  const recent = take(8, (items) => items);
  const collector = take(8, (items) => diversifyByCategory(items));
  const watched = take(7, (items) => items.filter((p) => p.storyline?.toLowerCase().includes('watched')));
  const arrivals = take(8, (items) => {
    const tagged = items.filter((p) => p.storyline?.toLowerCase().includes('new'));
    if (tagged.length) return tagged;
    return [...items].reverse();
  });

  return { featured, trending, recent, ending, verified, luxury, collector, watched, arrivals };
}

/** @deprecated Prefer `buildMarketplaceDiscoveryRails` — modulo wrap can repeat cards across rails. */
export function sliceRail(catalog: Product[], start: number, count: number): Product[] {
  if (!catalog.length) return [];
  const out: Product[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < catalog.length && out.length < count; i++) {
    const p = catalog[(start + i) % catalog.length];
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function pickVaultVerified(catalog: Product[], n = 8): Product[] {
  return catalog.filter((p) => p.vaultVerified).slice(0, n);
}

export function pickEndingSoon(_catalog: Product[], _n = 6): Product[] {
  return [];
}

export function pickTrending(catalog: Product[], n = 8): Product[] {
  const trend = catalog.filter((p) => p.storyline?.toLowerCase().includes('trending'));
  return trend.length ? trend.slice(0, n) : catalog.slice(0, Math.min(n, catalog.length));
}

export function pickLuxuryLane(catalog: Product[], n = 6): Product[] {
  return catalog.filter((p) => p.category === 'luxury' || p.category === 'watches').slice(0, n);
}

export function pickNewArrivals(catalog: Product[], n = 8): Product[] {
  const fresh = catalog.filter((p) => p.storyline?.toLowerCase().includes('new'));
  return fresh.length ? fresh.slice(0, n) : catalog.slice(0, Math.min(n, catalog.length));
}

export function pickMostWatched(catalog: Product[], n = 6): Product[] {
  const hot = catalog.filter((p) => p.storyline?.toLowerCase().includes('watched'));
  return hot.length ? hot.slice(0, n) : [];
}

/** True when no product id appears in more than one rail. */
export function marketplaceRailsHaveUniqueProducts(rails: MarketplaceDiscoveryRails): boolean {
  const seen = new Set<string>();
  for (const row of Object.values(rails)) {
    for (const product of row) {
      if (seen.has(product.id)) return false;
      seen.add(product.id);
    }
  }
  return true;
}
