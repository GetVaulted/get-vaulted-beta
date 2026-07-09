import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MarketplaceItemView } from "@/components/marketplace/MarketplaceItemView";
import type { MarketplaceListing } from "@/content/marketplace-listings";
import { getServerSessionSafe } from "@/lib/auth";
import { closeAuctionIfDuePrisma } from "@/lib/auction-close";
import { auctionBidCountsByListingIds } from "@/lib/listing-bid-counts";
import { dbListingToMarketplace } from "@/lib/listing-mapper";
import { isListingPubliclyVisible } from "@/lib/listing-moderation";
import { buildItemPageExtras } from "@/lib/marketplace-item-extras";
import { listingWithSellerFulfillmentInclude } from "@/lib/listing-with-seller-include";
import { sellerListingHref } from "@/lib/listing-routes";
import { isHiddenFixtureSellerEmail, prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";
import {
  buildListingPageMetadata,
  buildListingProductJsonLd,
} from "@/lib/site-seo";
import { JsonLdScript } from "@/components/seo/JsonLdScript";

export const dynamic = "force-dynamic";

const listingInclude = listingWithSellerFulfillmentInclude;

async function publishedDbListings(): Promise<MarketplaceListing[]> {
  const rows = await prisma.listing.findMany({
    where: {
      status: { in: ["active", "auction_live"] },
      moderationRemovedAt: null,
      isCompanyListing: false,
      seller: prismaSellerVisibleOnPublicMarketplace(),
    },
    include: listingInclude,
    orderBy: { createdAt: "desc" },
    take: 48,
  });
  const auctionIds = rows.filter((r) => r.buyingFormat === "auction").map((r) => r.id);
  const bidCounts = await auctionBidCountsByListingIds(auctionIds);
  return rows.map((row) =>
    dbListingToMarketplace(
      row,
      row.buyingFormat === "auction" ? { bidCount: bidCounts.get(row.id) ?? 0 } : undefined,
    ),
  );
}

function dedupeListings(pool: MarketplaceListing[]): MarketplaceListing[] {
  const seen = new Set<string>();
  const out: MarketplaceListing[] = [];
  for (const l of pool) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(l);
  }
  return out;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const listingId = decodeURIComponent(id);
  const row = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      description: true,
      condition: true,
      buyingFormat: true,
      status: true,
      sellerId: true,
      moderationRemovedAt: true,
      images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      seller: { select: { email: true, username: true } },
    },
  });
  if (row) {
    const session = await getServerSessionSafe();
    const isOwner = session?.user?.id === row.sellerId;
    const isPublic = isListingPubliclyVisible(row);
    const hideDemoFromPublic = isHiddenFixtureSellerEmail(row.seller.email) && !isOwner;
    if ((isPublic && !hideDemoFromPublic) || isOwner) {
      return buildListingPageMetadata({
        listingId: row.id,
        title: row.title,
        description: row.description,
        condition: row.condition,
        buyingFormat: row.buyingFormat,
        imageUrl: row.images[0]?.url ?? null,
      });
    }
  }
  return { title: "Listing | Get Vaulted", description: "Marketplace listing on Get Vaulted." };
}

export default async function PublicListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSessionSafe();
  const listingId = decodeURIComponent(id);

  let row = await prisma.listing.findUnique({
    where: { id: listingId },
    include: listingInclude,
  });

  if (row) {
    await closeAuctionIfDuePrisma(row.id);
    row = await prisma.listing.findUnique({
      where: { id: listingId },
      include: listingInclude,
    });
  }

  if (!row) {
    return <ListingNotFound />;
  }

  const isOwner = session?.user?.id === row.sellerId;
  const isPublic = isListingPubliclyVisible(row) && !isHiddenFixtureSellerEmail(row.seller.email);

  if (isOwner) {
    redirect(sellerListingHref(listingId));
  }

  if (!isPublic && !isOwner) {
    return <ListingNotFound />;
  }

  // Fire-and-forget: don't let a view-count write slow down or fail the page render.
  prisma.listing
    .update({ where: { id: row.id }, data: { viewsCount: { increment: 1 } } })
    .catch((e) => console.error("[listing/[id]] viewsCount increment failed", e));

  const [relatedPoolRaw, bc, watchingCount, sellerOrderCount] = await Promise.all([
    publishedDbListings(),
    row.buyingFormat === "auction" ? prisma.bid.count({ where: { listingId: row.id } }) : Promise.resolve(undefined),
    prisma.watchlistItem.count({ where: { listingId: row.id } }),
    prisma.order.count({ where: { sellerId: row.sellerId } }),
  ]);
  const relatedPool = dedupeListings(relatedPoolRaw);
  const listing = dbListingToMarketplace(row, bc != null ? { bidCount: bc } : undefined);
  const extras = buildItemPageExtras(listing, {
    watchingCount,
    sellerCredibilityLabel:
      sellerOrderCount > 0 ? `${sellerOrderCount.toLocaleString("en-US")} orders on Get Vaulted` : undefined,
  });
  const primaryImage = row.images[0]?.url ?? null;

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <JsonLdScript
        data={buildListingProductJsonLd({
          listingId: row.id,
          title: row.title,
          description: row.description,
          imageUrl: primaryImage,
          condition: row.condition,
          buyingFormat: row.buyingFormat,
          priceUsd: row.priceUsd,
          currentBidUsd: row.currentBidUsd,
          startingBidUsd: row.startingBidUsd,
          sellerUsername: row.seller.username,
          status: row.status,
        })}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(380px,50vh)] bg-[radial-gradient(ellipse_80%_55%_at_50%_-8%,rgba(201,162,39,0.07),transparent_55%)]"
        aria-hidden
      />
      <MarketplaceItemView listing={listing} extras={extras} relatedPool={relatedPool} />
    </main>
  );
}

function ListingNotFound() {
  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="mx-auto max-w-lg px-3 py-24 text-center">
        <p className="font-display text-xl font-bold text-foreground">Listing not found</p>
        <p className="mt-2 text-sm text-zinc-500">This item may have been removed or is not available.</p>
        <Link
          href="/marketplace"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.5)] transition hover:brightness-110"
        >
          Back to marketplace
        </Link>
      </div>
    </main>
  );
}

