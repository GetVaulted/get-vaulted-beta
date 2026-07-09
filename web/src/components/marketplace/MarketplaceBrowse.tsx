"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MarketplaceBrowseCard } from "@/components/marketplace/MarketplaceBrowseCard";
import { MarketplaceHero } from "@/components/marketplace/MarketplaceHero";
import {
  marketplaceBrowseGridClass,
  MarketplaceSectionHeader,
} from "@/components/marketplace/MarketplaceSectionHeader";
import { MarketplaceTrustStrip } from "@/components/marketplace/MarketplaceTrustStrip";
import { shouldShowVaultPicksRail } from "@/components/marketplace/marketplace-browse-vault-picks";
import { marketplaceCategories, type MarketplaceListing } from "@/content/marketplace-listings";

const sortOptions = [
  { value: "recent", label: "Recently listed" },
  { value: "price-asc", label: "Price: Low to high" },
  { value: "price-desc", label: "Price: High to low" },
  { value: "seller-level", label: "Seller level" },
] as const;

const conditionOptions = ["Any", "PSA 10", "PSA 9", "BGS 9.5", "Raw", "DS", "Excellent", "Authenticated", "LOA", "Unworn"] as const;

/** Debounce window before the search box's typed text triggers a server refetch. */
const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE = 60;

function hasActiveRefine(priceMin: string, priceMax: string, condition: string) {
  return priceMin !== "" || priceMax !== "" || condition !== "Any";
}

type BrowseResponse = {
  listings?: MarketplaceListing[];
  filteredListingCount?: number;
  totalListingCount?: number;
  hasMore?: boolean;
};

export function MarketplaceBrowse() {
  const searchParams = useSearchParams();
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<(typeof sortOptions)[number]["value"]>("recent");
  const [category, setCategory] = useState<(typeof marketplaceCategories)[number]>("All");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [condition, setCondition] = useState<string>("Any");
  const [refineOpen, setRefineOpen] = useState(false);

  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [page, setPage] = useState(1);
  const [filteredListingCount, setFilteredListingCount] = useState(0);
  const [totalListingCount, setTotalListingCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const requestSeq = useRef(0);

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (q) {
      setQueryInput(q);
      setQuery(q);
    }
  }, [searchParams]);

  // Debounce free-text search input before it drives a server refetch.
  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(queryInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [queryInput]);

  const filterKey = useMemo(
    () => JSON.stringify({ query, category, priceMin, priceMax, condition, sort }),
    [query, category, priceMin, priceMax, condition, sort],
  );

  const buildParams = (targetPage: number) => {
    const params = new URLSearchParams({ scope: "published", page: String(targetPage), pageSize: String(PAGE_SIZE) });
    if (query) params.set("q", query);
    if (category !== "All") params.set("category", category);
    if (priceMin !== "") params.set("priceMin", priceMin);
    if (priceMax !== "") params.set("priceMax", priceMax);
    if (condition !== "Any") params.set("condition", condition);
    params.set("sort", sort);
    return params;
  };

  // Loads page 1 for the *current* filter/sort state, replacing whatever's loaded. Shared by the
  // filter-change effect below and the "listings changed elsewhere" event listener.
  const loadFirstPage = async () => {
    const seq = ++requestSeq.current;
    try {
      const res = await fetch(`/api/listings?${buildParams(1).toString()}`);
      if (seq !== requestSeq.current) return;
      if (!res.ok) {
        setListings([]);
        setFilteredListingCount(0);
        setHasMore(false);
        return;
      }
      const data = (await res.json()) as BrowseResponse;
      if (seq !== requestSeq.current) return;
      setPage(1);
      setListings(Array.isArray(data.listings) ? data.listings : []);
      setFilteredListingCount(data.filteredListingCount ?? 0);
      setTotalListingCount(data.totalListingCount ?? 0);
      setHasMore(Boolean(data.hasMore));
    } catch {
      if (seq !== requestSeq.current) return;
      setListings([]);
      setFilteredListingCount(0);
      setHasMore(false);
    } finally {
      if (seq === requestSeq.current) setInitialLoadDone(true);
    }
  };

  // Filters/sort changed — reset to page 1 and replace the loaded list.
  useEffect(() => {
    void loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Re-run the current filter set when listings change elsewhere in the app (e.g. new publish).
  useEffect(() => {
    const on = () => void loadFirstPage();
    window.addEventListener("gv-listings-updated", on);
    return () => window.removeEventListener("gv-listings-updated", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const seq = requestSeq.current;
    try {
      const res = await fetch(`/api/listings?${buildParams(nextPage).toString()}`);
      if (seq !== requestSeq.current || !res.ok) return;
      const data = (await res.json()) as BrowseResponse;
      if (seq !== requestSeq.current) return;
      setListings((prev) => [...prev, ...(Array.isArray(data.listings) ? data.listings : [])]);
      setPage(nextPage);
      setHasMore(Boolean(data.hasMore));
    } catch {
      // no-op — user can retry via the button
    } finally {
      setLoadingMore(false);
    }
  };

  const noFiltersActive =
    query.trim() === "" && category === "All" && priceMin === "" && priceMax === "" && condition === "Any";

  // Vault picks are only surfaced on the true default, unfiltered first page — see
  // `shouldShowVaultPicksRail` for why both `noFiltersActive` and `page === 1` are required.
  const isFirstUnfilteredPage = shouldShowVaultPicksRail(noFiltersActive, page);
  const vaultPicks = useMemo(
    () => (isFirstUnfilteredPage ? listings.filter((l) => l.vaultPick) : []),
    [listings, isFirstUnfilteredPage],
  );
  const gridListings = useMemo(
    () => (isFirstUnfilteredPage ? listings.filter((l) => !l.vaultPick) : listings),
    [listings, isFirstUnfilteredPage],
  );

  const refineActive = hasActiveRefine(priceMin, priceMax, condition);
  const empty = initialLoadDone && listings.length === 0;

  const clearFilters = () => {
    setQueryInput("");
    setQuery("");
    setSort("recent");
    setCategory("All");
    setPriceMin("");
    setPriceMax("");
    setCondition("Any");
    setRefineOpen(false);
  };

  const marketplaceIsEmpty = initialLoadDone && totalListingCount === 0 && noFiltersActive;

  return (
    <>
      <MarketplaceHero
        query={queryInput}
        onQueryChange={setQueryInput}
        category={category}
        onCategoryChange={setCategory}
        listingCount={totalListingCount}
        filteredCount={filteredListingCount}
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
                  : `${filteredListingCount.toLocaleString()} piece${filteredListingCount === 1 ? "" : "s"} match your view`}
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
              {!marketplaceIsEmpty && (queryInput.trim() !== "" || category !== "All" || refineActive) ? (
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
                <MarketplaceBrowseCard key={l.id} listing={l} compact />
              ))}
            </div>
          )}

          {!empty && hasMore ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="inline-flex h-11 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-8 text-sm font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
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
