"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MarketplaceBrowseCard } from "@/components/marketplace/MarketplaceBrowseCard";
import { MarketplaceHero } from "@/components/marketplace/MarketplaceHero";
import {
  marketplaceBrowseGridClass,
  MarketplaceSectionHeader,
} from "@/components/marketplace/MarketplaceSectionHeader";
import { MarketplaceTrustStrip } from "@/components/marketplace/MarketplaceTrustStrip";
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

function parseListedAt(s: string) {
  return new Date(s).getTime();
}

function hasActiveRefine(priceMin: string, priceMax: string, condition: string) {
  return priceMin !== "" || priceMax !== "" || condition !== "Any";
}

export function MarketplaceBrowse() {
  const searchParams = useSearchParams();
  const [dbListings, setDbListings] = useState<MarketplaceListing[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<(typeof sortOptions)[number]["value"]>("recent");
  const [category, setCategory] = useState<(typeof marketplaceCategories)[number]>("All");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [condition, setCondition] = useState<string>("Any");
  const [refineOpen, setRefineOpen] = useState(false);

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (q) setQuery(q);
  }, [searchParams]);

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

  const refineActive = hasActiveRefine(priceMin, priceMax, condition);

  const clearFilters = () => {
    setQuery("");
    setSort("recent");
    setCategory("All");
    setPriceMin("");
    setPriceMax("");
    setCondition("Any");
    setRefineOpen(false);
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
    <>
      <MarketplaceHero
        query={query}
        onQueryChange={setQuery}
        category={category}
        onCategoryChange={setCategory}
        listingCount={dbListings.length}
        filteredCount={filtered.length}
      />

      <MarketplaceTrustStrip variant="band" />

      <div className="mx-auto w-full max-w-[1920px] px-3 pb-8 pt-3 sm:px-4 sm:pb-10 sm:pt-4 lg:px-10">
        {/* Browse toolbar — sort + optional refine */}
        <div className="rounded-xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.01)_100%)] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Browse</p>
              <p className="mt-0.5 text-sm text-zinc-400">
                {empty
                  ? "Adjust search or filters to explore the catalog"
                  : `${filtered.length.toLocaleString()} piece${filtered.length === 1 ? "" : "s"} match your view`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[11rem] flex-1 sm:flex-none sm:w-52">
                <label htmlFor="marketplace-sort" className="sr-only">
                  Sort listings
                </label>
                <select
                  id="marketplace-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as (typeof sortOptions)[number]["value"])}
                  className="h-10 w-full cursor-pointer rounded-xl border border-white/10 bg-[#0a0a0e] px-3 text-sm text-foreground outline-none ring-gold/20 focus:border-gold/35 focus:ring-2"
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setRefineOpen((open) => !open)}
                aria-expanded={refineOpen}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[11px] font-bold uppercase tracking-wide transition ${
                  refineOpen || refineActive
                    ? "border-gold/40 bg-gold/10 text-gold-bright"
                    : "border-white/10 bg-[#0a0a0e] text-zinc-300 hover:border-gold/25 hover:text-zinc-100"
                }`}
              >
                <FilterIcon className="size-3.5" aria-hidden />
                Refine
                {refineActive ? (
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-gold-bright text-[9px] font-black text-zinc-950">
                    !
                  </span>
                ) : null}
              </button>
              {!marketplaceIsEmpty && (query.trim() !== "" || category !== "All" || refineActive) ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-10 items-center rounded-xl border border-white/10 px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 transition hover:border-white/20 hover:text-zinc-300"
                >
                  Reset
                </button>
              ) : null}
            </div>
          </div>

          {refineOpen ? (
            <div className="mt-4 grid gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Price range</p>
                <div className="flex gap-2">
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
                    className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0a0a0e] px-3 text-sm text-foreground outline-none focus:border-gold/35"
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
                    className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0a0a0e] px-3 text-sm text-foreground outline-none focus:border-gold/35"
                  />
                </div>
              </div>
              <div>
                <label
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                  htmlFor="filter-condition"
                >
                  Condition / grade
                </label>
                <select
                  id="filter-condition"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="h-10 w-full rounded-xl border border-white/10 bg-[#0a0a0e] px-3 text-sm text-foreground outline-none focus:border-gold/35"
                >
                  {conditionOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>

        {!empty && vaultPicks.length > 0 ? (
          <section className="mt-5 sm:mt-6" aria-labelledby="vault-picks-title">
            <MarketplaceSectionHeader
              id="vault-picks-title"
              eyebrow="Curated"
              title="Vault picks"
              meta={`${vaultPicks.length} featured`}
              accent="gold"
            />
            <div className={marketplaceBrowseGridClass}>
              {vaultPicks.map((l) => (
                <MarketplaceBrowseCard key={`vp-${l.id}`} listing={l} vaultPick emphasizeHover />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-4 sm:mt-5" aria-labelledby="all-listings-title">
          <MarketplaceSectionHeader
            id="all-listings-title"
            eyebrow="The collection"
            title={vaultPicks.length > 0 ? "More from the vault" : "Browse the vault"}
            meta={gridListings.length > 0 ? `${gridListings.length} listing${gridListings.length === 1 ? "" : "s"}` : undefined}
            compact
          />

          {empty ? (
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[linear-gradient(165deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.01)_100%)] px-6 py-14 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(201,162,39,0.08),transparent_60%)]"
                aria-hidden
              />
              <p className="relative font-display text-xl font-semibold text-foreground sm:text-2xl">
                {marketplaceIsEmpty ? "The vault is ready for its first listings" : "No matches in this view"}
              </p>
              <p className="relative mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-500">
                {marketplaceIsEmpty
                  ? "As sellers publish graded cards, slabs, and memorabilia, they appear here automatically—no placeholders, only real inventory."
                  : "Try a broader search, another category, or clear your filters to see more of the catalog."}
              </p>
              {marketplaceIsEmpty ? (
                <Link
                  href="/sell/create"
                  className="relative mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-7 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.55)] transition hover:brightness-110"
                >
                  Be among the first to list
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="relative mt-6 inline-flex h-11 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-7 text-sm font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : gridListings.length === 0 ? (
            <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-8 text-center text-sm text-zinc-500">
              All matches in this view are featured in{" "}
              <span className="font-semibold text-gold-bright/90">Vault picks</span> above.
            </p>
          ) : (
            <div className={marketplaceBrowseGridClass}>
              {gridListings.map((l) => (
                <MarketplaceBrowseCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 4h18M6 12h12M10 20h4"
      />
    </svg>
  );
}
