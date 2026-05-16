import type { Metadata } from "next";
import Link from "next/link";
import { MarketplaceBrowseCard } from "@/components/marketplace/MarketplaceBrowseCard";
import type { MarketplaceListing } from "@/content/marketplace-listings";
import { auctionBidCountsByListingIds } from "@/lib/listing-bid-counts";
import { dbListingToMarketplace } from "@/lib/listing-mapper";
import { listingWithSellerFulfillmentInclude } from "@/lib/listing-with-seller-include";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const listingInclude = listingWithSellerFulfillmentInclude;

export const metadata: Metadata = {
  title: "Merch — Get Vaulted",
  description: "Official Get Vaulted products and company drops.",
};

export default async function MerchPage() {
  const rows = await prisma.listing.findMany({
    where: {
      isCompanyListing: true,
      status: { in: ["active", "auction_live"] },
      moderationRemovedAt: null,
    },
    include: listingInclude,
    orderBy: { createdAt: "desc" },
    take: 48,
  });

  const auctionIds = rows.filter((r) => r.buyingFormat === "auction").map((r) => r.id);
  const bidCounts = await auctionBidCountsByListingIds(auctionIds);
  const listings: MarketplaceListing[] = rows.map((row) =>
    dbListingToMarketplace(
      row,
      row.buyingFormat === "auction" ? { bidCount: bidCounts.get(row.id) ?? 0 } : undefined,
    ),
  );

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(420px,55vh)] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(201,162,39,0.09),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[1400px] px-4 pb-16 pt-8 sm:px-6 lg:px-10">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-bright/85">Get Vaulted</p>
        <h1 className="font-display mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">Merch</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Official drops and company-owned listings. Checkout and shipping work the same as the marketplace.
        </p>

        {listings.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-12 text-center">
            <p className="text-sm font-semibold text-zinc-300">No merch listings yet</p>
            <p className="mt-2 text-sm text-zinc-500">
              Official company-owned drops will show here once they are published to the marketplace.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3">
            {listings.map((listing) => (
              <MarketplaceBrowseCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-zinc-600">
          <Link href="/marketplace" className="font-semibold text-gold-bright/90 hover:text-gold-bright hover:underline">
            Browse marketplace
          </Link>
        </p>
      </div>
    </main>
  );
}
