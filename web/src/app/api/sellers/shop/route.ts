import { NextResponse } from "next/server";
import { resolveOptionalListingsUserId } from "@/lib/resolve-listings-auth";
import { auctionBidCountsByListingIds } from "@/lib/listing-bid-counts";
import { dbListingToMarketplace } from "@/lib/listing-mapper";
import { listingWithSellerFulfillmentInclude } from "@/lib/listing-with-seller-include";
import { isHiddenFixtureSellerEmail } from "@/lib/demo-seed-sellers";
import { NEW_SELLER_CREDIBILITY_LABEL } from "@/lib/marketplace-item-extras";
import { prisma } from "@/lib/prisma";
import { viewerCanSeeUser } from "@/lib/user-block";
import {
  parseSellerShopTab,
  SELLER_SHOP_DEFAULT_PAGE_SIZE,
  SELLER_SHOP_MAX_PAGE_SIZE,
  sellerShopEmptyCopy,
  sellerShopListingWhere,
} from "@/lib/seller-shop-listings";

const listingInclude = listingWithSellerFulfillmentInclude;

function parsePositiveInt(v: string | null, fallback: number, max: number): number {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sellerIdParam = searchParams.get("sellerId")?.trim();
  const usernameParam = searchParams.get("username")?.trim();

  if (!sellerIdParam && !usernameParam) {
    return NextResponse.json({ error: "sellerId or username is required." }, { status: 400 });
  }

  const user = sellerIdParam
    ? await prisma.user.findFirst({
        where: { id: sellerIdParam, suspendedAt: null },
        select: {
          id: true,
          username: true,
          name: true,
          image: true,
          emailVerified: true,
          email: true,
        },
      })
    : await prisma.user.findUnique({
        where: { username: decodeURIComponent(usernameParam!) },
        select: {
          id: true,
          username: true,
          name: true,
          image: true,
          emailVerified: true,
          email: true,
        },
      });

  if (!user) {
    return NextResponse.json({ error: "Seller not found." }, { status: 404 });
  }

  const viewerId = await resolveOptionalListingsUserId(req);
  const viewer = viewerId
    ? await prisma.user.findUnique({ where: { id: viewerId }, select: { role: true } })
    : null;
  const isOwnShop = viewerId === user.id;
  const isAdmin = viewer?.role === "admin";
  if (isHiddenFixtureSellerEmail(user.email) && !isOwnShop && !isAdmin) {
    return NextResponse.json({ error: "Seller not found." }, { status: 404 });
  }
  if (!(await viewerCanSeeUser(prisma, viewerId, user.id))) {
    return NextResponse.json({ error: "Seller not found." }, { status: 404 });
  }

  const tab = parseSellerShopTab(searchParams.get("tab"));
  const page = parsePositiveInt(searchParams.get("page"), 1, 10_000);
  const pageSize = parsePositiveInt(
    searchParams.get("pageSize"),
    SELLER_SHOP_DEFAULT_PAGE_SIZE,
    SELLER_SHOP_MAX_PAGE_SIZE,
  );
  const skip = (page - 1) * pageSize;
  const where = sellerShopListingWhere(user.id, tab);

  const [
    activeListingsCount,
    soldListingsCount,
    auctionsLiveCount,
    salesOrderCount,
    followerCount,
    total,
    rows,
  ] = await Promise.all([
    prisma.listing.count({
      where: { sellerId: user.id, status: { in: ["active", "auction_live"] }, moderationRemovedAt: null },
    }),
    prisma.listing.count({ where: { sellerId: user.id, status: "sold" } }),
    prisma.listing.count({ where: { sellerId: user.id, status: "auction_live" } }),
    prisma.order.count({ where: { sellerId: user.id } }),
    prisma.sellerFollow.count({ where: { sellerId: user.id } }),
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      include: listingInclude,
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  const auctionIds = rows.filter((r) => r.buyingFormat === "auction").map((r) => r.id);
  const bidCounts = await auctionBidCountsByListingIds(auctionIds);
  const listings = rows.map((r) =>
    dbListingToMarketplace(r, r.buyingFormat === "auction" ? { bidCount: bidCounts.get(r.id) ?? 0 } : undefined),
  );

  const credibility =
    salesOrderCount > 0
      ? `${salesOrderCount.toLocaleString("en-US")} orders on Get Vaulted`
      : NEW_SELLER_CREDIBILITY_LABEL;

  return NextResponse.json({
    seller: {
      id: user.id,
      username: user.username,
      name: user.name,
      image: user.image,
      verified: user.emailVerified != null,
      credibility,
      isOwnShop,
    },
    stats: {
      activeListings: activeListingsCount,
      soldListings: soldListingsCount,
      auctionsLive: auctionsLiveCount,
      followerCount,
      orderCount: salesOrderCount,
    },
    tab,
    emptyCopy: sellerShopEmptyCopy(tab),
    listings,
    page,
    pageSize,
    total,
    hasMore: skip + rows.length < total,
  });
}
