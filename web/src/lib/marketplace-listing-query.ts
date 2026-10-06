import type { Prisma } from "@/generated/prisma/client";
import {
  PUBLIC_MARKETPLACE_LISTING_WHERE,
} from "@/lib/marketplace-commerce-policy";
import { prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import { marketplaceCategories, type MarketplaceCategory } from "@/content/marketplace-listings";

/**
 * Server-side search/filter/sort/pagination for the public marketplace browse feed
 * (`GET /api/listings?scope=published`).
 *
 * The public browse feed only ever contains `buy_now` listings (see
 * `PUBLIC_MARKETPLACE_LISTING_WHERE` — timed marketplace auctions are disabled), so `priceUsd`
 * is always the listing's real, final price here. That means price filtering/sorting can safely
 * use the plain `priceUsd` column with full accuracy (no need to reconstruct a "current bid"
 * display price like the seller/live-order fee-tier code does elsewhere).
 */

export const MARKETPLACE_BROWSE_SORTS = ["recent", "price-asc", "price-desc", "seller-level"] as const;
export type MarketplaceBrowseSort = (typeof MARKETPLACE_BROWSE_SORTS)[number];

/**
 * Listing category labels the browse feed also accepts, beyond the web catalog's own filter list
 * (`marketplaceCategories`). Sellers can publish under these (e.g. helmets), and the mobile
 * marketplace offers them as chips — without this the server would ignore the filter and return
 * every listing.
 */
export const MARKETPLACE_BROWSE_EXTRA_CATEGORIES = ["Helmets"] as const;
export type MarketplaceBrowseCategory =
  | MarketplaceCategory
  | "All"
  | (typeof MARKETPLACE_BROWSE_EXTRA_CATEGORIES)[number];

/**
 * Some listings carry the short label "Cards" instead of "Trading Cards". The "Trading Cards"
 * filter matches both so a buyer sees every card listing under one category.
 */
const MARKETPLACE_CATEGORY_ALIASES: Partial<Record<MarketplaceBrowseCategory, string[]>> = {
  "Trading Cards": ["Trading Cards", "Cards"],
};

export const MARKETPLACE_BROWSE_DEFAULT_PAGE_SIZE = 60;
export const MARKETPLACE_BROWSE_MAX_PAGE_SIZE = 120;

export type MarketplaceBrowseQueryParams = {
  q: string;
  category: MarketplaceBrowseCategory;
  priceMin: number | null;
  priceMax: number | null;
  condition: string;
  sort: MarketplaceBrowseSort;
  page: number;
  pageSize: number;
};

function parseNumberParam(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Parses/normalizes browse query params from a request URL's `searchParams`. Never throws. */
export function parseMarketplaceBrowseQueryParams(searchParams: URLSearchParams): MarketplaceBrowseQueryParams {
  const q = (searchParams.get("q") ?? "").trim().slice(0, 200);

  const categoryRaw = searchParams.get("category") ?? "All";
  const category = (
    [...marketplaceCategories, ...MARKETPLACE_BROWSE_EXTRA_CATEGORIES] as string[]
  ).includes(categoryRaw)
    ? (categoryRaw as MarketplaceBrowseCategory)
    : "All";

  const priceMin = parseNumberParam(searchParams.get("priceMin"));
  const priceMax = parseNumberParam(searchParams.get("priceMax"));

  const condition = (searchParams.get("condition") ?? "Any").trim().slice(0, 60) || "Any";

  const sortRaw = searchParams.get("sort") ?? "recent";
  const sort: MarketplaceBrowseSort = (MARKETPLACE_BROWSE_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as MarketplaceBrowseSort)
    : "recent";

  const page = parseIntParam(searchParams.get("page"), 1, 1, 100_000);
  const pageSize = parseIntParam(
    searchParams.get("pageSize"),
    MARKETPLACE_BROWSE_DEFAULT_PAGE_SIZE,
    1,
    MARKETPLACE_BROWSE_MAX_PAGE_SIZE,
  );

  return { q, category, priceMin, priceMax, condition, sort, page, pageSize };
}

/** Builds the Prisma `where` clause for the filtered browse feed (excludes pagination/sort). */
export function buildMarketplaceBrowseWhere(
  params: Pick<MarketplaceBrowseQueryParams, "q" | "category" | "priceMin" | "priceMax" | "condition">,
): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {
    ...PUBLIC_MARKETPLACE_LISTING_WHERE,
    seller: prismaSellerVisibleOnPublicMarketplace(),
  };

  if (params.category !== "All") {
    const aliases = MARKETPLACE_CATEGORY_ALIASES[params.category];
    where.category = aliases ? { in: aliases } : params.category;
  }
  if (params.condition !== "Any") {
    where.condition = params.condition;
  }
  if (params.priceMin != null || params.priceMax != null) {
    where.priceUsd = {
      ...(params.priceMin != null ? { gte: params.priceMin } : {}),
      ...(params.priceMax != null ? { lte: params.priceMax } : {}),
    };
  }
  if (params.q) {
    where.OR = [
      { title: { contains: params.q, mode: "insensitive" } },
      { seller: { username: { contains: params.q, mode: "insensitive" } } },
    ];
  }

  return where;
}

/** Builds the Prisma `orderBy` clause for a given sort option. Always includes a stable tiebreaker. */
export function buildMarketplaceBrowseOrderBy(
  sort: MarketplaceBrowseSort,
): Prisma.ListingOrderByWithRelationInput[] {
  if (sort === "price-asc") return [{ priceUsd: "asc" }, { createdAt: "desc" }];
  if (sort === "price-desc") return [{ priceUsd: "desc" }, { createdAt: "desc" }];
  // Enum declaration order (vault_seller < trusted_seller < vault_verified < elite_vault_verified)
  // matches the desired rank order, so a plain `desc` sort on the relation field is correct.
  if (sort === "seller-level") return [{ seller: { sellerLevel: "desc" } }, { createdAt: "desc" }];
  return [{ createdAt: "desc" }];
}
