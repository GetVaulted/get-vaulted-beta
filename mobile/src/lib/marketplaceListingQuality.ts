import type { Product } from '../types';

export function parseListingPriceUsd(price: string): number | null {
  const n = Number(price.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Minimum quality bar for discovery/home marketplace rails — filters test junk and incomplete rows. */
const JUNK_TITLE_DENYLIST = new Set([
  'cake',
  'good',
  'ank',
  'yummy cake',
  'test',
  'test listing',
  'listing',
  'item',
  'sample',
]);

function hasListingImage(product: Product): boolean {
  return Boolean(product.imageUrl?.trim() || product.imageUrls?.[0]?.trim());
}

function hasListingSeller(product: Product): boolean {
  const sellerId = product.seller?.id?.trim();
  const sellerName = product.seller?.name?.trim();
  return Boolean(sellerId && sellerName);
}

/** Published catalog browse (The Vault tab) — keep real published listings, drop only broken rows. */
export function isBrowsableMarketplaceProduct(product: Product): boolean {
  const id = product.id?.trim();
  const title = product.title?.trim() ?? '';
  if (!id || !title) return false;

  const price = parseListingPriceUsd(product.listingPrice);
  if (price == null || price <= 0) return false;
  if (!hasListingImage(product)) return false;
  if (!hasListingSeller(product)) return false;

  return true;
}

export function isDisplayableMarketplaceProduct(product: Product): boolean {
  if (!isBrowsableMarketplaceProduct(product)) return false;

  const title = product.title?.trim() ?? '';
  const normalizedTitle = title.toLowerCase();
  if (JUNK_TITLE_DENYLIST.has(normalizedTitle)) return false;
  if (/^listing$/i.test(title)) return false;
  if (title.length < 8) return false;

  const words = title.split(/\s+/).filter(Boolean);
  if (words.length === 1 && title.length < 10) return false;

  const image = product.imageUrl?.trim() || product.imageUrls?.[0]?.trim();
  if (!image || !/^https?:\/\//i.test(image)) return false;

  return true;
}

export function filterBrowsableMarketplaceProducts(products: readonly Product[]): Product[] {
  return products.filter(isBrowsableMarketplaceProduct);
}

export function filterDisplayableMarketplaceProducts(products: readonly Product[]): Product[] {
  return products.filter(isDisplayableMarketplaceProduct);
}

export function excludeProductsById(
  products: readonly Product[],
  excludedIds: ReadonlySet<string>,
): Product[] {
  return products.filter((p) => !excludedIds.has(p.id));
}

export function productIdSet(products: readonly Product[]): Set<string> {
  return new Set(products.map((p) => p.id));
}
