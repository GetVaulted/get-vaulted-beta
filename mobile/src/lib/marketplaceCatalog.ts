import { filterCatalogByMarketplaceLane, type MarketplaceLaneId } from '../data/marketplaceCategories';
import { marketplaceDemoProducts } from '../data/marketplaceFeedMock';
import type { CategoryId, Product } from '../types';

export function buildMarketplaceCatalog(real: Product[]): Product[] {
  const realIds = new Set(real.map((p) => p.id));
  const demos = marketplaceDemoProducts.filter((d) => !realIds.has(d.id));
  if (real.length >= 12) return real;
  const need = Math.max(12 - real.length, 0);
  return [...real, ...demos.slice(0, need + 8)];
}

export function filterByCategory(catalog: Product[], category: CategoryId | 'all'): Product[] {
  if (category === 'all') return catalog;
  return catalog.filter((p) => p.category === category);
}

export function filterByMarketplaceLane(catalog: Product[], lane: MarketplaceLaneId): Product[] {
  return filterCatalogByMarketplaceLane(catalog, lane);
}

export function sliceRail(catalog: Product[], start: number, count: number): Product[] {
  if (!catalog.length) return [];
  const out: Product[] = [];
  for (let i = 0; i < count; i++) {
    out.push(catalog[(start + i) % catalog.length]);
  }
  return out;
}

export function pickVaultVerified(catalog: Product[], n = 8): Product[] {
  const verified = catalog.filter((p) => p.vaultVerified);
  return verified.length ? verified.slice(0, n) : sliceRail(catalog, 2, n);
}

export function pickEndingSoon(catalog: Product[], n = 6): Product[] {
  const ending = catalog.filter((p) => p.auctionEnds);
  return ending.length ? ending.slice(0, n) : sliceRail(catalog, 4, n);
}

export function pickLuxuryLane(catalog: Product[], n = 6): Product[] {
  const luxury = catalog.filter((p) => p.category === 'luxury' || p.category === 'watches');
  return luxury.length ? luxury.slice(0, n) : sliceRail(catalog, 6, n);
}

export function pickNewArrivals(catalog: Product[], n = 8): Product[] {
  const fresh = catalog.filter((p) => p.storyline?.toLowerCase().includes('new'));
  return fresh.length ? fresh.slice(0, n) : sliceRail(catalog, 1, n);
}

export function pickMostWatched(catalog: Product[], n = 6): Product[] {
  const hot = catalog.filter((p) => p.storyline?.toLowerCase().includes('watched'));
  return hot.length ? hot.slice(0, n) : sliceRail(catalog, 0, n);
}

export function pickTrending(catalog: Product[], n = 8): Product[] {
  const trend = catalog.filter(
    (p) => p.storyline?.toLowerCase().includes('trending') || p.auctionEnds,
  );
  return trend.length ? trend.slice(0, n) : sliceRail(catalog, 0, n);
}
