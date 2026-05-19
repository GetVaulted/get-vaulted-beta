import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSessionSafe } from "@/lib/auth";
import { closeAuctionIfDuePrisma } from "@/lib/auction-close";
import { isListingPubliclyVisible } from "@/lib/listing-moderation";
import { publicListingHref, sellerListingHref } from "@/lib/listing-routes";
import { isHiddenFixtureSellerEmail } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

/** Legacy `/marketplace/:id` URLs redirect to canonical buyer or seller listing routes. */
export default async function MarketplaceItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getServerSessionSafe();
  const id = decodeURIComponent(slug);

  const row = await prisma.listing.findUnique({
    where: { id },
    select: {
      id: true,
      sellerId: true,
      status: true,
      moderationRemovedAt: true,
      seller: { select: { email: true } },
    },
  });

  if (row) {
    await closeAuctionIfDuePrisma(row.id);
    const isOwner = session?.user?.id === row.sellerId;
    const isPublic = isListingPubliclyVisible(row) && !isHiddenFixtureSellerEmail(row.seller.email);

    if (isOwner) {
      redirect(sellerListingHref(id));
    }
    if (isPublic) {
      redirect(publicListingHref(id));
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
