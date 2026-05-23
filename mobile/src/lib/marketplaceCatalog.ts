import { filterCatalogByMarketplaceLane, type MarketplaceLaneId } from '../data/marketplaceCategories';
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

/** Unique products only — never duplicate cards to pad a rail. */
export function sliceRail(catalog: Product[], start: number, count: number): Product[] {
  if (!catalog.length) return [];
  const out: Product[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < catalog.length * 2 && out.length < count; i++) {
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
