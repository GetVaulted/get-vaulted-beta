import { dbListingToMarketplace } from "@/lib/listing-mapper";
import { listingWithSellerFulfillmentInclude } from "@/lib/listing-with-seller-include";
import { PUBLIC_MARKETPLACE_LISTING_WHERE } from "@/lib/marketplace-commerce-policy";
import {
  buildMarketplaceBrowseOrderBy,
  buildMarketplaceBrowseWhere,
  parseMarketplaceBrowseQueryParams,
  type MarketplaceBrowseCategory,
} from "@/lib/marketplace-listing-query";
import { prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";
import type { MarketplaceListing } from "@/content/marketplace-listings";
import { MARKETPLACE_SSR_PAGE_SIZE } from "@/lib/marketplace-browse-paths";

export {
  MARKETPLACE_CATEGORY_PAGES,
  MARKETPLACE_SSR_PAGE_SIZE,
  marketplaceCategoryBySlug,
  marketplaceCategoryPath,
  marketplacePagePath,
  parseMarketplacePageParam,
} from "@/lib/marketplace-browse-paths";

export type MarketplaceInitialPage = {
  listings: MarketplaceListing[];
  page: number;
  totalPages: number;
  category: MarketplaceBrowseCategory;
  filteredListingCount: number;
  totalListingCount: number;
  hasMore: boolean;
};

/**
 * One page of the public marketplace (newest first), built on the server so the HTML Google receives already
 * contains every listing card and its link. The browser grid used to fetch this from `/api/listings` after
 * load, but `/api/` is disallowed in robots.txt, so crawlers saw an empty page and never discovered listing
 * URLs. Same query as `GET /api/listings?scope=published` for an anonymous viewer (signed-in viewers still
 * refetch client-side to apply their block list). Together with numbered page links and category pages,
 * every active listing is reachable by ordinary links. Returns null on error so the client fetch takes over.
 */
export async function loadMarketplaceInitialPage(
  opts: { page?: number; category?: MarketplaceBrowseCategory } = {},
): Promise<MarketplaceInitialPage | null> {
  const page = Math.max(1, opts.page ?? 1);
  const category = opts.category ?? "All";
  try {
    const params = new URLSearchParams({
      scope: "published",
      page: String(page),
      pageSize: String(MARKETPLACE_SSR_PAGE_SIZE),
      sort: "recent",
    });
    if (category !== "All") params.set("category", category);
    const query = parseMarketplaceBrowseQueryParams(params);
    const baseWhere = { ...PUBLIC_MARKETPLACE_LISTING_WHERE, seller: prismaSellerVisibleOnPublicMarketplace() };
    const filteredWhere = buildMarketplaceBrowseWhere(query);
    const [rows, filteredListingCount, totalListingCount] = await Promise.all([
      prisma.listing.findMany({
        where: filteredWhere,
        include: listingWithSellerFulfillmentInclude,
        orderBy: buildMarketplaceBrowseOrderBy(query.sort),
        skip: (page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.listing.count({ where: filteredWhere }),
      prisma.listing.count({ where: baseWhere }),
    ]);
    return {
      listings: rows.map((r) => dbListingToMarketplace(r)),
      page,
      totalPages: Math.max(1, Math.ceil(filteredListingCount / query.pageSize)),
      category,
      filteredListingCount,
      totalListingCount,
      hasMore: page * query.pageSize < filteredListingCount,
    };
  } catch (e) {
    console.error("[marketplace SSR] page load failed; client fetch will load it", { page, category, error: e });
    return null;
  }
}
