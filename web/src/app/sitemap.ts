import type { MetadataRoute } from "next";
import { HELP_ARTICLES } from "../../../shared/help-center-articles";
import { isHiddenFixtureSellerEmail, prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import { canonicalShareSiteUrl } from "@/lib/live-room-share-metadata";
import { publicListingHref } from "@/lib/listing-routes";
import { sellerProfilePath } from "@/lib/seller-profile-url";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const STATIC_PATHS = [
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

function entry(path: string, lastModified?: Date, changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"], priority?: number): MetadataRoute.Sitemap[number] {
  return {
    url: `${canonicalShareSiteUrl()}${path}`,
    lastModified: lastModified ?? new Date(),
    changeFrequency,
    priority,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries = STATIC_PATHS.map((path) =>
    entry(path, now, path === "/" ? "daily" : "weekly", path === "/" ? 1 : 0.8),
  );

  const articleEntries = HELP_ARTICLES.map((article) =>
    entry(`/support/${encodeURIComponent(article.id)}`, now, "monthly", 0.6),
  );

  let listingEntries: MetadataRoute.Sitemap = [];
  let sellerEntries: MetadataRoute.Sitemap = [];
  let liveEntries: MetadataRoute.Sitemap = [];

  try {
    const [listings, sellers, liveRooms] = await Promise.all([
      prisma.listing.findMany({
        where: {
          status: { in: ["active", "auction_live"] },
          moderationRemovedAt: null,
          isCompanyListing: false,
          seller: prismaSellerVisibleOnPublicMarketplace(),
        },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
      prisma.user.findMany({
        where: {
          ...prismaSellerVisibleOnPublicMarketplace(),
          listings: {
            some: {
              status: { in: ["active", "auction_live", "sold"] },
              moderationRemovedAt: null,
            },
          },
        },
        select: { username: true, updatedAt: true, email: true },
        orderBy: { updatedAt: "desc" },
        take: 2000,
      }),
      prisma.liveRoom.findMany({
        where: {
          status: { in: ["live", "scheduled"] },
          seller: prismaSellerVisibleOnPublicMarketplace(),
        },
        select: { id: true, updatedAt: true, seller: { select: { email: true } } },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
    ]);

    listingEntries = listings.map((row) =>
      entry(publicListingHref(row.id), row.updatedAt, "daily", 0.7),
    );

    sellerEntries = sellers
      .filter((row) => !isHiddenFixtureSellerEmail(row.email))
      .map((row) => entry(sellerProfilePath(row.username), row.updatedAt, "weekly", 0.6));

    liveEntries = liveRooms
      .filter((row) => !isHiddenFixtureSellerEmail(row.seller.email))
      .map((row) => entry(`/live/${encodeURIComponent(row.id)}`, row.updatedAt, "hourly", 0.7));
  } catch (e) {
    console.error("[sitemap] dynamic entries failed — serving static URLs only", e);
  }

  return [...staticEntries, ...articleEntries, ...listingEntries, ...sellerEntries, ...liveEntries];
}
