import type { Metadata } from "next";
import Link from "next/link";
import { MarketplaceItemView } from "@/components/marketplace/MarketplaceItemView";
import type { MarketplaceListing } from "@/content/marketplace-listings";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { closeAuctionIfDuePrisma } from "@/lib/auction-close";
import { auctionBidCountsByListingIds } from "@/lib/listing-bid-counts";
import { dbListingToMarketplace, dbListingToStored } from "@/lib/listing-mapper";
import { isListingPubliclyVisible } from "@/lib/listing-moderation";
import { buildItemPageExtras } from "@/lib/marketplace-item-extras";
import { listingWithSellerFulfillmentInclude } from "@/lib/listing-with-seller-include";
import { isHiddenFixtureSellerEmail, prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";
import { storedToMarketplaceListing } from "@/lib/user-listings-storage";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const id = decodeURIComponent(slug);
  const session = await getServerSessionSafe();
  const row = await prisma.listing.findUnique({
    where: { id },
    select: {
      title: true,
      condition: true,
      buyingFormat: true,
      status: true,
      sellerId: true,
      moderationRemovedAt: true,
      seller: { select: { email: true } },
    },
  });
  if (row) {
    const isOwner = session?.user?.id === row.sellerId;
    const isPublic = isListingPubliclyVisible(row);
    const hideDemoFromPublic = isHiddenFixtureSellerEmail(row.seller.email) && !isOwner;
    if ((isPublic && !hideDemoFromPublic) || isOwner) {
      return {
        title: `${row.title} | Get Vaulted`,
        description: `${row.condition} · ${row.buyingFormat === "buy_now" ? "Buy now" : "Auction"} on Get Vaulted marketplace.`,
      };
    }
  }
  return { title: "Listing | Get Vaulted", description: "Marketplace listing on Get Vaulted." };
}

export default async function MarketplaceItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getServerSessionSafe();
  const id = decodeURIComponent(slug);

  let row = await prisma.listing.findUnique({
    where: { id },
    include: listingInclude,
  });

  if (row) {
    await closeAuctionIfDuePrisma(row.id);
    row = await prisma.listing.findUnique({
      where: { id },
      include: listingInclude,
    });
  }

  if (row) {
    const isOwner = session?.user?.id === row.sellerId;
    const isPublic = isListingPubliclyVisible(row);

    if (isPublic && !isHiddenFixtureSellerEmail(row.seller.email)) {
      const relatedPool = dedupeListings(await publishedDbListings());
      const bc =
        row.buyingFormat === "auction"
          ? await prisma.bid.count({ where: { listingId: row.id } })
          : undefined;
      const listing = dbListingToMarketplace(row, bc != null ? { bidCount: bc } : undefined);
      const extras = buildItemPageExtras(listing);
      return (
        <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[min(380px,50vh)] bg-[radial-gradient(ellipse_80%_55%_at_50%_-8%,rgba(201,162,39,0.07),transparent_55%)]"
            aria-hidden
          />
          <MarketplaceItemView listing={listing} extras={extras} relatedPool={relatedPool} />
        </main>
      );
    }

    if (isOwner) {
      const relatedPool = dedupeListings(await publishedDbListings());
      const pending = await prisma.offer.count({ where: { listingId: row.id, status: "pending" } });
      const bc =
        row.buyingFormat === "auction"
          ? await prisma.bid.count({ where: { listingId: row.id } })
          : undefined;
      const stored = dbListingToStored(row, pending, bc);
      const listing = storedToMarketplaceListing(stored);
      const extras = buildItemPageExtras(listing);
      return (
        <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[min(380px,50vh)] bg-[radial-gradient(ellipse_80%_55%_at_50%_-8%,rgba(201,162,39,0.07),transparent_55%)]"
            aria-hidden
          />
          <MarketplaceItemView
            listing={listing}
            extras={extras}
            relatedPool={relatedPool}
            expiredAuctionRecoveryListingId={row.status === "auction_ended_unpaid" ? row.id : undefined}
            sellerFulfillmentWarnings={stored.fulfillmentWarnings}
          />
        </main>
      );
    }
  }

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
