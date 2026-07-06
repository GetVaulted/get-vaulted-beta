import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { MarketplaceBrowseCard } from "@/components/marketplace/MarketplaceBrowseCard";
import { SellerProfileActions } from "@/components/seller/SellerProfileActions";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { auctionBidCountsByListingIds } from "@/lib/listing-bid-counts";
import { dbListingToMarketplace } from "@/lib/listing-mapper";
import { NEW_SELLER_CREDIBILITY_LABEL } from "@/lib/marketplace-item-extras";
import { listingWithSellerFulfillmentInclude } from "@/lib/listing-with-seller-include";
import { isHiddenFixtureSellerEmail } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";
import { sellerProfilePath } from "@/lib/seller-profile-url";

export const dynamic = "force-dynamic";

const listingInclude = listingWithSellerFulfillmentInclude;

type Tab = "all" | "buy_now" | "auctions" | "sold";

function parseTab(v: string | string[] | undefined): Tab {
  const raw = Array.isArray(v) ? v[0] : v;
  if (raw === "buy_now" || raw === "auctions" || raw === "sold") return raw;
  return "all";
}

function listingWhereForTab(sellerId: string, tab: Tab): Prisma.ListingWhereInput {
  if (tab === "sold") {
    return { sellerId, status: "sold" };
  }
  const visible = { moderationRemovedAt: null };
  if (tab === "buy_now") {
    return { sellerId, status: "active", buyingFormat: "buy_now", ...visible };
  }
  if (tab === "auctions") {
    return {
      sellerId,
      ...visible,
      OR: [{ status: "auction_live" }, { status: "active", buyingFormat: "auction" }],
    };
  }
  return { sellerId, status: { in: ["active", "auction_live"] }, ...visible };
}

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "buy_now", label: "Buy now" },
  { key: "auctions", label: "Auctions" },
  { key: "sold", label: "Sold" },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username: raw } = await params;
  const username = decodeURIComponent(raw);
  const session = await getServerSessionSafe();
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, email: true },
  });
  if (!user) return { title: "Seller | Get Vaulted" };
  const canIndexShop =
    !isHiddenFixtureSellerEmail(user.email) ||
    session?.user?.id === user.id ||
    session?.user?.role === "admin";
  if (!canIndexShop) return { title: "Seller | Get Vaulted" };
  return {
    title: `@${user.username} · Seller shop | Get Vaulted`,
    description: `Listings and storefront for @${user.username} on Get Vaulted.`,
  };
}

export default async function SellerShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { username: raw } = await params;
  const sp = await searchParams;
  const username = decodeURIComponent(raw);
  const tab = parseTab(sp.tab);

  const session = await getServerSessionSafe();

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, name: true, image: true, emailVerified: true, email: true },
  });
  if (!user) notFound();
  const isOwnShop = session?.user?.id === user.id;
  const isAdmin = session?.user?.role === "admin";
  if (isHiddenFixtureSellerEmail(user.email) && !isOwnShop && !isAdmin) notFound();

  const basePath = sellerProfilePath(user.username);

  const [activeListingsCount, soldListingsCount, auctionsLiveCount, salesOrderCount, followerCount, rows] =
    await Promise.all([
    prisma.listing.count({
      where: { sellerId: user.id, status: { in: ["active", "auction_live"] }, moderationRemovedAt: null },
    }),
    prisma.listing.count({ where: { sellerId: user.id, status: "sold" } }),
    prisma.listing.count({ where: { sellerId: user.id, status: "auction_live" } }),
    prisma.order.count({ where: { sellerId: user.id } }),
    prisma.sellerFollow.count({ where: { sellerId: user.id } }),
    prisma.listing.findMany({
      where: listingWhereForTab(user.id, tab),
      include: listingInclude,
      orderBy: { updatedAt: "desc" },
      take: 60,
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
  const verified = user.emailVerified != null;

  const emptyCopy =
    tab === "sold"
      ? "No sold listings to show yet."
      : "This seller has no active listings.";

  const initials = user.username
    .slice(0, 2)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 2) || "?";

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(380px,50vh)] bg-[radial-gradient(ellipse_80%_55%_at_50%_-8%,rgba(201,162,39,0.07),transparent_55%)]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-20 pt-5 sm:px-4 lg:px-10">
        <Link
          href="/marketplace"
          className="inline-flex text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 transition hover:text-gold-bright"
        >
          ← Marketplace
        </Link>

        <header className="mt-6 flex flex-col gap-6 border-b border-white/[0.08] pb-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#121218] sm:size-24">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-display text-xl font-black text-gold-bright/90 sm:text-2xl">
                  {initials}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Seller shop</p>
              <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                @{user.username}
              </h1>
              {user.name ? <p className="mt-1 text-sm text-zinc-400">{user.name}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                <span className="text-[11px] font-medium text-zinc-500">{credibility}</span>
                {verified ? (
                  <span className="inline-flex items-center rounded border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-200">
                    Verified
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <SellerProfileActions
            sellerId={user.id}
            sellerUsername={user.username}
            isOwnShop={isOwnShop}
            messageListing={
              listings[0]
                ? { id: listings[0].id, title: listings[0].title }
                : null
            }
          />
        </header>

        <section className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3" aria-label="Seller stats">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Active listings</p>
            <p className="mt-1 font-mono text-xl font-black tabular-nums text-gold-bright">{activeListingsCount}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Sold</p>
            <p className="mt-1 font-mono text-xl font-black tabular-nums text-zinc-100">{soldListingsCount}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Auctions live</p>
            <p className="mt-1 font-mono text-xl font-black tabular-nums text-rose-100/95">{auctionsLiveCount}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Followers</p>
            <p className="mt-1 font-mono text-xl font-black tabular-nums text-zinc-100">{followerCount}</p>
            <p className="mt-0.5 text-[9px] text-zinc-600">
              {session?.user?.id === user.id ? "Your followers" : "Shop followers"}
            </p>
          </div>
        </section>

        <nav className="mt-8 flex flex-wrap gap-2 border-b border-white/[0.06] pb-3" aria-label="Listing filters">
          {TABS.map((t) => {
            const href = t.key === "all" ? basePath : `${basePath}?tab=${t.key}`;
            const active = tab === t.key;
            return (
              <Link
                key={t.key}
                href={href}
                scroll={false}
                className={`inline-flex h-9 items-center rounded-full px-4 text-xs font-semibold transition ${
                  active
                    ? "border border-gold/40 bg-gold/15 text-gold-bright"
                    : "border border-transparent text-zinc-500 hover:border-white/10 hover:bg-white/[0.03] hover:text-zinc-300"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <section className="mt-6" aria-label="Seller listings">
          {listings.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-14 text-center">
              <p className="text-sm font-medium text-zinc-400">{emptyCopy}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 lg:gap-3 xl:grid-cols-5 2xl:grid-cols-6">
              {listings.map((l) => (
                <MarketplaceBrowseCard key={l.id} listing={l} vaultPick={Boolean(l.vaultPick)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
