import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketplaceBrowseCard } from "@/components/marketplace/MarketplaceBrowseCard";
import { marketplaceBrowseGridClass } from "@/components/marketplace/MarketplaceSectionHeader";
import { SellerProfileActions } from "@/components/seller/SellerProfileActions";
import { SellerPullsSection } from "@/components/seller/SellerPullsSection";
import {
  SellerBadges,
  SellerBanner,
  SellerBio,
  SellerLinks,
  SellerRecentShows,
  SellerShowCard,
  SellerTrustCard,
} from "@/components/seller/SellerProfileSections";
import { SellerReviewsSection } from "@/components/seller/SellerReviewsSection";
import { SellerProfileStatsBar } from "@/components/seller/SellerProfileStatsBar";
import { getServerSessionSafe } from "@/lib/auth";
import { auctionBidCountsByListingIds } from "@/lib/listing-bid-counts";
import { dbListingToMarketplace } from "@/lib/listing-mapper";
import { listingWithSellerFulfillmentInclude } from "@/lib/listing-with-seller-include";
import { isHiddenFixtureSellerEmail } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";
import { profileLinksFromStored } from "@/lib/seller-profile-fields";
import {
  buildProfileTrust,
  loadProfileShows,
  loadSellerSalesCount,
  sellerFollowerWhere,
} from "@/lib/seller-profile-public";
import { loadSellerReviewSummary, loadSellerReviews } from "@/lib/seller-review-queries";
import { sellerProfilePath } from "@/lib/seller-profile-url";
import { buildSellerPageMetadata, buildSellerProfileJsonLd } from "@/lib/site-seo";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { viewerCanSeeUser } from "@/lib/user-block";
import {
  parseSellerShopTab,
  SELLER_SHOP_TABS,
  sellerShopEmptyCopy,
  sellerShopListingWhere,
  type SellerShopTab,
} from "@/lib/seller-shop-listings";

export const dynamic = "force-dynamic";

const listingInclude = listingWithSellerFulfillmentInclude;

function parseTab(v: string | string[] | undefined): SellerShopTab {
  const raw = Array.isArray(v) ? v[0] : v;
  return parseSellerShopTab(raw);
}

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
    select: { id: true, username: true, name: true, image: true, email: true },
  });
  if (!user) return { title: "Seller | Get Vaulted" };
  const canIndexShop =
    !isHiddenFixtureSellerEmail(user.email) ||
    session?.user?.id === user.id ||
    session?.user?.role === "admin";
  if (!canIndexShop) return { title: "Seller | Get Vaulted" };
  return buildSellerPageMetadata({
    username: user.username,
    displayName: user.username,
    imageUrl: user.image,
  });
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
    select: {
      id: true,
      username: true,
      name: true,
      image: true,
      emailVerified: true,
      email: true,
      sellerLevel: true,
      createdAt: true,
      profileBio: true,
      profileBannerUrl: true,
      profileLinks: true,
    },
  });
  if (!user) notFound();
  const isOwnShop = session?.user?.id === user.id;
  const isAdmin = session?.user?.role === "admin";
  if (isHiddenFixtureSellerEmail(user.email) && !isOwnShop && !isAdmin) notFound();
  if (!(await viewerCanSeeUser(prisma, session?.user?.id, user.id))) notFound();

  const basePath = sellerProfilePath(user.username);

  const [
    activeListingsCount,
    salesCount,
    followerCount,
    followingCount,
    shows,
    reviewSummary,
    reviews,
    rows,
    pullMedia,
  ] = await Promise.all([
    prisma.listing.count({
      where: { sellerId: user.id, status: { in: ["active", "auction_live"] }, moderationRemovedAt: null },
    }),
    loadSellerSalesCount(prisma, user.id),
    prisma.sellerFollow.count({ where: sellerFollowerWhere(user.id) }),
    prisma.sellerFollow.count({ where: { followerId: user.id } }),
    loadProfileShows(prisma, user.id),
    loadSellerReviewSummary(prisma, user.id),
    loadSellerReviews(prisma, user.id, { take: 10 }),
    prisma.listing.findMany({
      where: sellerShopListingWhere(user.id, tab),
      include: listingInclude,
      orderBy: { updatedAt: "desc" },
      take: 60,
    }),
    prisma.profilePullMedia.findMany({
      where: { sellerId: user.id },
      orderBy: { sortOrder: "asc" },
      take: 25,
      include: {
        _count: { select: { likes: true, comments: true } },
        ...(session?.user?.id
          ? { likes: { where: { userId: session.user.id }, select: { id: true } } }
          : {}),
      },
    }),
  ]);

  const pullMediaWithEngagement = pullMedia.map((m) => {
    const { _count, likes, ...rest } = m as typeof m & { likes?: { id: string }[] };
    return {
      ...rest,
      likeCount: _count.likes,
      commentCount: _count.comments,
      viewerHasLiked: Boolean(likes && likes.length),
    };
  });

  const auctionIds = rows.filter((r) => r.buyingFormat === "auction").map((r) => r.id);
  const bidCounts = await auctionBidCountsByListingIds(auctionIds);
  const listings = rows.map((r) =>
    dbListingToMarketplace(r, r.buyingFormat === "auction" ? { bidCount: bidCounts.get(r.id) ?? 0 } : undefined),
  );

  const trust = buildProfileTrust({
    sellerLevel: user.sellerLevel,
    ordersCompleted: salesCount,
    createdAt: user.createdAt,
    emailVerified: user.emailVerified,
  });
  const links = profileLinksFromStored(user.profileLinks);

  const emptyCopy = sellerShopEmptyCopy(tab);

  const initials = user.username
    .slice(0, 2)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 2) || "?";

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <JsonLdScript
        data={buildSellerProfileJsonLd({
          username: user.username,
          displayName: user.username,
          imageUrl: user.image,
        })}
      />
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

        <div className="mt-5">
          <SellerBanner url={user.profileBannerUrl} />
        </div>

        <header className="relative -mt-10 flex flex-col gap-5 pb-6 sm:-mt-12 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 px-1 sm:flex-row sm:items-end sm:gap-5 sm:px-3">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-3xl border-2 border-gold/50 bg-[#121218] shadow-[0_0_0_4px_#030303] sm:size-28">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-display text-2xl font-black text-gold-bright/90 sm:text-3xl">
                  {initials}
                </span>
              )}
            </div>
            <div className="min-w-0 pb-1">
              <h1 className="font-display text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                @{user.username}
              </h1>
              <div className="mt-2">
                <SellerBadges trust={trust} />
              </div>
              <SellerBio bio={user.profileBio} />
              <SellerLinks links={links} />
              <SellerProfileStatsBar
                stats={{
                  followerCount,
                  followingCount,
                  salesCount,
                  showsHosted: shows.totalShows,
                  isOwnShop,
                }}
              />
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

        <div className="mt-2 grid gap-8 border-t border-white/[0.08] pt-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
          <div className="min-w-0 space-y-10">
            <SellerPullsSection media={pullMediaWithEngagement} />

            <section aria-label="Shop">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display text-xl font-black tracking-tight text-foreground">Shop</h2>
                <span className="text-xs text-zinc-500">
                  {activeListingsCount.toLocaleString("en-US")} listing{activeListingsCount === 1 ? "" : "s"}
                </span>
              </div>

              <nav className="mt-3 flex flex-wrap gap-2 border-b border-white/[0.06] pb-3" aria-label="Listing filters">
                {SELLER_SHOP_TABS.map((t) => {
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

              <div className="mt-5" aria-label="Seller listings">
                {listings.length === 0 ? (
                  <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-14 text-center">
                    <p className="text-sm font-medium text-zinc-400">{emptyCopy}</p>
                  </div>
                ) : (
                  <div className={marketplaceBrowseGridClass}>
                    {listings.map((l) => (
                      <MarketplaceBrowseCard key={l.id} listing={l} vaultPick={Boolean(l.vaultPick)} compact />
                    ))}
                  </div>
                )}
              </div>
            </section>

            <SellerReviewsSection summary={reviewSummary} reviews={reviews} />

            <SellerRecentShows shows={shows.recent} totalShows={shows.totalShows} />
          </div>

          <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Seller details">
            <SellerShowCard liveNow={shows.liveNow} nextShow={shows.nextShow} lastLive={shows.lastLive} />
            <SellerTrustCard trust={trust} reviews={reviewSummary} />
          </aside>
        </div>
      </div>
    </main>
  );
}
