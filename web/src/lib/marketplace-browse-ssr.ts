import { dbListingToMarketplace } from "@/lib/listing-mapper";
import { listingWithSellerFulfillmentInclude } from "@/lib/listing-with-seller-include";
import { PUBLIC_MARKETPLACE_LISTING_WHERE } from "@/lib/marketplace-commerce-policy";
import {
  buildMarketplaceBrowseOrderBy,
  buildMarketplaceBrowseWhere,
  parseMarketplaceBrowseQueryParams,
} from "@/lib/marketplace-listing-query";
import { prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";
import type { MarketplaceListing } from "@/content/marketplace-listings";

export const MARKETPLACE_SSR_PAGE_SIZE = 60;

export type MarketplaceInitialPage = {
  listings: MarketplaceListing[];
  filteredListingCount: number;
  totalListingCount: number;
  hasMore: boolean;
};

/**
 * First page of the public marketplace (newest first, no filters), built on the server so the HTML Google
 * receives already contains every listing card and its link. The browser grid used to fetch this from
 * `/api/listings` after load, but `/api/` is disallowed in robots.txt, so crawlers saw an empty page and
 * never discovered listing URLs from /marketplace. Same query as `GET /api/listings?scope=published&page=1`
 * for an anonymous viewer (signed-in viewers still refetch client-side to apply their block list).
 * Returns null on any error so the page still renders and the client fetch takes over.
 */
export async function loadMarketplaceInitialPage(): Promise<MarketplaceInitialPage | null> {
  try {
    const query = parseMarketplaceBrowseQueryParams(
      new URLSearchParams({ scope: "published", page: "1", pageSize: String(MARKETPLACE_SSR_PAGE_SIZE), sort: "recent" }),
    );
    const baseWhere = { ...PUBLIC_MARKETPLACE_LISTING_WHERE, seller: prismaSellerVisibleOnPublicMarketplace() };
    const filteredWhere = buildMarketplaceBrowseWhere(query);
    const [rows, filteredListingCount, totalListingCount] = await Promise.all([
      prisma.listing.findMany({
        where: filteredWhere,
        include: listingWithSellerFulfillmentInclude,
        orderBy: buildMarketplaceBrowseOrderBy(query.sort),
        take: query.pageSize,
      }),
      prisma.listing.count({ where: filteredWhere }),
      prisma.listing.count({ where: baseWhere }),
    ]);
    return {
      listings: rows.map((r) => dbListingToMarketplace(r)),
      filteredListingCount,
      totalListingCount,
      hasMore: query.pageSize < filteredListingCount,
    };
  } catch (e) {
    console.error("[marketplace SSR] initial page failed; client fetch will load it", e);
    return null;
  }
}
