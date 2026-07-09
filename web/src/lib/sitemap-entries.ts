import type { MetadataRoute } from "next";
import { createPostgresPrismaClient } from "@/lib/prisma-pg-factory";
import { isHiddenFixtureSellerEmail, prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import { HELP_ARTICLES } from "@/lib/help-center-articles";
import { canonicalShareSiteUrl } from "@/lib/live-room-share-metadata";
import { publicListingHref } from "@/lib/listing-routes";
import { resolveDatabaseUrl } from "@/lib/resolve-database-url";
import { sellerProfilePath } from "@/lib/seller-profile-url";

export const SITEMAP_STATIC_PATHS = [
  "/",
  "/marketplace",
  "/merch",
  "/app",
  "/support",
  "/support/contact",
  "/terms",
  "/privacy",
  "/community-guidelines",
  "/dmca",
  "/prohibited-items",
  "/reporting-safety",
  "/account-deletion",
] as const;

export function sitemapEntry(
  path: string,
  lastModified?: Date,
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"],
  priority?: number,
): MetadataRoute.Sitemap[number] {
  return {
    url: `${canonicalShareSiteUrl()}${path}`,
    lastModified: lastModified ?? new Date(),
    changeFrequency,
    priority,
  };
}

export function buildStaticSitemapEntries(now = new Date()): MetadataRoute.Sitemap {
  return SITEMAP_STATIC_PATHS.map((path) =>
    sitemapEntry(path, now, path === "/" ? "daily" : "weekly", path === "/" ? 1 : 0.8),
  );
}

export function buildHelpArticleSitemapEntries(now = new Date()): MetadataRoute.Sitemap {
  return HELP_ARTICLES.map((article) =>
    sitemapEntry(`/support/${encodeURIComponent(article.id)}`, now, "monthly", 0.6),
  );
}

function createSitemapPrisma() {
  const direct = process.env.DIRECT_URL?.trim();
  const pooled = resolveDatabaseUrl();
  const url = direct || pooled;
  return createPostgresPrismaClient(url);
}

export async function buildListingSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const db = createSitemapPrisma();
  try {
    const listings = await db.listing.findMany({
      where: {
        status: { in: ["active", "auction_live"] },
        moderationRemovedAt: null,
        isCompanyListing: false,
        seller: prismaSellerVisibleOnPublicMarketplace(),
      },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });
    return listings.map((row) => sitemapEntry(publicListingHref(row.id), row.updatedAt, "daily", 0.7));
  } catch (e) {
    console.error("[sitemap] listing entries failed", e);
    return [];
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

export async function buildSellerSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const db = createSitemapPrisma();
  try {
    const sellers = await db.user.findMany({
      where: {
        AND: [
          prismaSellerVisibleOnPublicMarketplace(),
          {
            listings: {
              some: {
                status: { in: ["active", "auction_live", "sold"] },
                moderationRemovedAt: null,
              },
            },
          },
        ],
      },
      select: { username: true, updatedAt: true, email: true },
      orderBy: { updatedAt: "desc" },
      take: 2000,
    });
    return sellers
      .filter((row) => !isHiddenFixtureSellerEmail(row.email))
      .map((row) => sitemapEntry(sellerProfilePath(row.username), row.updatedAt, "weekly", 0.6));
  } catch (e) {
    console.error("[sitemap] seller entries failed", e);
    return [];
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

export async function buildLiveRoomSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const db = createSitemapPrisma();
  try {
    const liveRooms = await db.liveRoom.findMany({
      where: {
        status: { in: ["live", "scheduled"] },
        seller: prismaSellerVisibleOnPublicMarketplace(),
      },
      select: { id: true, updatedAt: true, seller: { select: { email: true } } },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    return liveRooms
      .filter((row) => !isHiddenFixtureSellerEmail(row.seller.email))
      .map((row) => sitemapEntry(`/live/${encodeURIComponent(row.id)}`, row.updatedAt, "hourly", 0.7));
  } catch (e) {
    console.error("[sitemap] live room entries failed", e);
    return [];
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

export async function buildFullSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [listingEntries, sellerEntries, liveEntries] = await Promise.all([
    buildListingSitemapEntries(),
    buildSellerSitemapEntries(),
    buildLiveRoomSitemapEntries(),
  ]);

  return [
    ...buildStaticSitemapEntries(now),
    ...buildHelpArticleSitemapEntries(now),
    ...listingEntries,
    ...sellerEntries,
    ...liveEntries,
  ];
}
