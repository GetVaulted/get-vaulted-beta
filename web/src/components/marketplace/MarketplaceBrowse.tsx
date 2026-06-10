"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MarketplaceBrowseCard } from "@/components/marketplace/MarketplaceBrowseCard";
import { marketplaceCategories, type MarketplaceListing } from "@/content/marketplace-listings";

const sortOptions = [
  { value: "recent", label: "Recently listed" },
  { value: "price-asc", label: "Price: Low to high" },
  { value: "price-desc", label: "Price: High to low" },
  { value: "seller-level", label: "Seller level" },
] as const;

const SELLER_LEVEL_RANK: Record<string, number> = {
  elite_vault_verified: 4,
  vault_verified: 3,
  trusted_seller: 2,
  vault_seller: 1,
};

const conditionOptions = ["Any", "PSA 10", "PSA 9", "BGS 9.5", "Raw", "DS", "Excellent", "Authenticated", "LOA", "Unworn"] as const;

/** Same grid as `FeaturedMarketplaceSection` so tile width matches the homepage marketplace row */
const listingGridClass = "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3";

function parseListedAt(s: string) {
  return new Date(s).getTime();
}

export function MarketplaceBrowse() {
  const [dbListings, setDbListings] = useState<MarketplaceListing[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<(typeof sortOptions)[number]["value"]>("recent");
  const [category, setCategory] = useState<(typeof marketplaceCategories)[number]>("All");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [condition, setCondition] = useState<string>("Any");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/listings?scope=published");
        if (!res.ok) return;
        const data = (await res.json()) as { listings?: MarketplaceListing[] };
        setDbListings(Array.isArray(data.listings) ? data.listings : []);
      } catch {
        setDbListings([]);
      }
    };
    void load();
    const on = () => void load();
    window.addEventListener("gv-listings-updated", on);
    return () => {
      window.removeEventListener("gv-listings-updated", on);
    };
  }, []);

  const allListings = useMemo(() => dbListings, [dbListings]);

  const filtered = useMemo(() => {
    let list: MarketplaceListing[] = [...allListings];

    if (category !== "All") {
      list = list.filter((l) => l.category === category);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (l) => l.title.toLowerCase().includes(q) || l.sellerUsername.toLowerCase().includes(q),
      );
    }

    const min = priceMin === "" ? null : Number(priceMin);
    const max = priceMax === "" ? null : Number(priceMax);
    if (min !== null && !Number.isNaN(min)) list = list.filter((l) => l.price >= min);
    if (max !== null && !Number.isNaN(max)) list = list.filter((l) => l.price <= max);

    if (condition !== "Any") {
      list = list.filter((l) => l.condition === condition);
    }

    const sorted = [...list];
    if (sort === "recent") sorted.sort((a, b) => parseListedAt(b.listedAt) - parseListedAt(a.listedAt));
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    if (sort === "seller-level") {
      sorted.sort(
        (a, b) =>
          (SELLER_LEVEL_RANK[b.sellerLevel ?? ""] ?? 0) - (SELLER_LEVEL_RANK[a.sellerLevel ?? ""] ?? 0),
      );
    }

    return sorted;
  }, [allListings, category, condition, priceMax, priceMin, query, sort]);

  const vaultPicks = useMemo(() => filtered.filter((l) => l.vaultPick), [filtered]);
  const gridListings = useMemo(() => filtered.filter((l) => !l.vaultPick), [filtered]);

  const clearFilters = () => {
    setQuery("");
    setSort("recent");
    setCategory("All");
    setPriceMin("");
    setPriceMax("");
    setCondition("Any");
  };

  const empty = filtered.length === 0;
  const marketplaceIsEmpty =
    dbListings.length === 0 &&
    category === "All" &&
    condition === "Any" &&
    priceMin === "" &&
    priceMax === "" &&
    query.trim() === "";

  return (
    <div className="mx-auto w-full max-w-[1920px] px-3 pb-10 pt-3 sm:px-4 sm:pt-4 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 transition hover:text-gold-bright"
        >
          ← Back to home
        </Link>
        <Link
          href="/sell/create"
          className="inline-flex text-[11px] font-semibold uppercase tracking-wider text-zinc-500 transition hover:text-gold-bright"
        >
          Sell an item →
        </Link>
      </div>

      {/* Header */}
      <header className="mt-3 border-b border-white/[0.08] pb-4 sm:pb-5">
        <h1 className="font-display text-2xl font-black tracking-tight text-foreground sm:text-3xl">Marketplace</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-500 sm:text-base">
          Browse verified listings, grails, slabs, and collector drops.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:flex-row sm:items-center sm:gap-2.5">
          <label htmlFor="marketplace-search" className="sr-only">
            Search listings
          </label>
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-500">
              <SearchIcon className="size-4" aria-hidden />
            </span>
            <input
              id="marketplace-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, sellers…"
              className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] pl-10 pr-3 text-sm text-foreground outline-none ring-gold/20 placeholder:text-zinc-600 focus:border-gold/35 focus:ring-2"
            />
          </div>
          <div className="shrink-0 sm:w-52">
            <label htmlFor="marketplace-sort" className="sr-only">
              Sort
            </label>
            <select
              id="marketplace-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as (typeof sortOptions)[number]["value"])}
              className="h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none ring-gold/20 focus:border-gold/35 focus:ring-2"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Categories */}
      <section className="mt-4 border-b border-white/[0.06] pb-3" aria-label="Categories">
        <div className="flex flex-wrap gap-1.5">
          {marketplaceCategories.map((c) => {
            const selected = c === category;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition sm:text-[11px] ${
                  selected
                    ? "border-gold/50 bg-gold/15 text-gold-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                    : "border-white/12 bg-white/[0.03] text-zinc-400 hover:border-gold/25 hover:text-zinc-200"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      </section>

      {/* Listing filters */}
      <section className="mt-3 space-y-1.5 border-b border-white/[0.06] pb-3" aria-label="Listing filters">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Refine</p>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Price range</p>
            <div className="flex gap-1.5">
              <label className="sr-only" htmlFor="price-min">
                Minimum price
              </label>
              <input
                id="price-min"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Min"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0c0c10] px-2.5 text-xs text-foreground outline-none focus:border-gold/35"
              />
              <label className="sr-only" htmlFor="price-max">
                Maximum price
              </label>
              <input
                id="price-max"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Max"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0c0c10] px-2.5 text-xs text-foreground outline-none focus:border-gold/35"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500" htmlFor="filter-condition">
              Condition
            </label>
            <select
              id="filter-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-2.5 text-xs text-foreground outline-none focus:border-gold/35"
            >
              {conditionOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Vault Picks */}
      {!empty && vaultPicks.length > 0 ? (
        <section className="mt-4" aria-labelledby="vault-picks-title">
          <div className="mb-2 flex items-end justify-between gap-2 border-b border-gold/20 pb-1.5">
            <h2 id="vault-picks-title" className="font-display text-sm font-bold text-gold-bright sm:text-base">
              Vault Picks
            </h2>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Curated</span>
          </div>
          <div className={listingGridClass}>
            {vaultPicks.map((l) => (
              <MarketplaceBrowseCard key={`vp-${l.id}`} listing={l} vaultPick />
            ))}
          </div>
        </section>
      ) : null}

      {/* Main grid */}
      <section className="mt-6" aria-labelledby="all-listings-title">
        <div className="mb-2 flex items-end justify-between gap-2 border-b border-white/[0.07] pb-1.5">
          <h2 id="all-listings-title" className="text-xs font-black uppercase tracking-wide text-zinc-300 sm:text-sm">
            All listings
          </h2>
          <span className="text-[10px] text-zinc-600">{gridListings.length} shown</span>
        </div>

        {empty ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-12 text-center">
            <p className="font-display text-lg font-semibold text-foreground">
              {marketplaceIsEmpty ? "Marketplace is empty" : "No listings found"}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {marketplaceIsEmpty
                ? "Listings from sellers will appear here once they publish. Create a listing to go live on the marketplace."
                : "Try widening your search or clearing filters."}
            </p>
            {marketplaceIsEmpty ? (
              <Link
                href="/sell/create"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-6 text-sm font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15"
              >
                List an item
              </Link>
            ) : (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-6 text-sm font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : gridListings.length === 0 ? (
          <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-sm text-zinc-500">
            All matches are in <span className="font-semibold text-gold-bright/90">Vault Picks</span> above.
          </p>
        ) : (
          <div className={listingGridClass}>
            {gridListings.map((l) => (
              <MarketplaceBrowseCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
    </svg>
  );
}
