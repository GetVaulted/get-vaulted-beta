"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MarketplaceProductCard } from "@/components/cards/MarketplaceProductCard";
import { MarketRowHeader } from "@/components/layout/MarketRowHeader";
import type { MarketplaceListing } from "@/content/marketplace-listings";

export function FeaturedMarketplaceSection() {
  const [listings, setListings] = useState<MarketplaceListing[] | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/listings?scope=published", { cache: "no-store" });
        if (!res.ok) {
          setListings([]);
          return;
        }
        const data = (await res.json()) as { listings?: MarketplaceListing[] };
        setListings(Array.isArray(data.listings) ? data.listings.slice(0, 6) : []);
      } catch {
        setListings([]);
      }
    };
    void run();
    const onCatalogChange = () => void run();
    window.addEventListener("gv-listings-updated", onCatalogChange);
    return () => window.removeEventListener("gv-listings-updated", onCatalogChange);
  }, []);

  const ready = listings !== null;
  const hasRows = ready && listings.length > 0;

  return (
    <section
      id="featured-marketplace"
      className="scroll-mt-16 border-b border-white/[0.08] bg-[linear-gradient(180deg,#131318_0%,#070708_100%)] py-9 sm:py-11"
      aria-labelledby="featured-title"
    >
      <div className="mx-auto w-full max-w-[1920px] px-3 sm:px-4 lg:px-10">
        <MarketRowHeader
          titleId="featured-title"
          title="Featured marketplace"
          actionLabel="View all"
          actionHref="/marketplace"
        />
        {!ready ? (
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.04] motion-reduce:animate-none"
                aria-hidden
              />
            ))}
          </div>
        ) : hasRows ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
            {listings.map((item) => (
              <MarketplaceProductCard
                key={item.id}
                compact
                title={item.title}
                condition={item.condition}
                seller={item.sellerUsername}
                price={item.price}
                seed={item.imageSeed}
                href={item.href}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-10 text-center sm:px-8">
            <p className="text-sm font-medium text-zinc-300">Marketplace is warming up</p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
              No featured listings yet. Browse the full catalog or be among the first sellers to list graded cards and
              slabs.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/marketplace"
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-semibold text-zinc-200 transition hover:border-gold/35 hover:text-gold-bright"
              >
                Browse marketplace
              </Link>
              <Link
                href="/account/seller/setup"
                className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-5 text-sm font-bold text-zinc-950 shadow-[0_0_24px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110"
              >
                Start selling
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
