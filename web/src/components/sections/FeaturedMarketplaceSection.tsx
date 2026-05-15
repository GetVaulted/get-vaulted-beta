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
            <p className="text-sm font-medium text-zinc-300">No published listings yet</p>
            <p className="mt-2 text-xs text-zinc-500">
              When sellers go live on the marketplace, highlights will appear here automatically.
            </p>
            <Link
              href="/sell/create"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-6 text-sm font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15"
            >
              List an item
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
