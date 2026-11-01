import { marketplaceCategories } from "@/content/marketplace-listings";
import {
  MARKETPLACE_BROWSE_EXTRA_CATEGORIES,
  type MarketplaceBrowseCategory,
} from "@/lib/marketplace-listing-query";

/** Listings per crawlable marketplace page (server-rendered page and "Load more" both use it). */
export const MARKETPLACE_SSR_PAGE_SIZE = 60;

/** Browse categories that get their own crawlable page (/marketplace/category/<slug>). Browser-safe. */
export const MARKETPLACE_CATEGORY_PAGES: Array<{
  category: Exclude<MarketplaceBrowseCategory, "All">;
  slug: string;
  description: string;
}> = [...marketplaceCategories, ...MARKETPLACE_BROWSE_EXTRA_CATEGORIES]
  .filter((c): c is Exclude<MarketplaceBrowseCategory, "All"> => c !== "All")
  .map((category) => ({
    category,
    slug: category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    description: `Shop ${category.toLowerCase()} on Get Vaulted — verified sellers, buy now and auctions, buyer protection on every order.`,
  }));

export function marketplaceCategoryBySlug(slug: string) {
  return MARKETPLACE_CATEGORY_PAGES.find((c) => c.slug === slug) ?? null;
}

/** Crawlable path for a category ("All" → /marketplace). */
export function marketplaceCategoryPath(category: MarketplaceBrowseCategory): string {
  if (category === "All") return "/marketplace";
  const hit = MARKETPLACE_CATEGORY_PAGES.find((c) => c.category === category);
  return hit ? `/marketplace/category/${hit.slug}` : "/marketplace";
}

/** Crawlable path for one numbered page of a category (page 1 has no ?page). */
export function marketplacePagePath(category: MarketplaceBrowseCategory, page: number): string {
  const base = marketplaceCategoryPath(category);
  return page > 1 ? `${base}?page=${page}` : base;
}

/** `?page=` value → page number (1 when missing or invalid). */
export function parseMarketplacePageParam(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
}
