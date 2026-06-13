import Link from "next/link";
import { MarketplaceTrustStrip } from "@/components/marketplace/MarketplaceTrustStrip";
import { marketplaceCategories, type MarketplaceCategory } from "@/content/marketplace-listings";

type MarketplaceHeroProps = {
  query: string;
  onQueryChange: (value: string) => void;
  category: MarketplaceCategory | "All";
  onCategoryChange: (category: MarketplaceCategory | "All") => void;
  listingCount: number;
  filteredCount: number;
};

export function MarketplaceHero({
  query,
  onQueryChange,
  category,
  onCategoryChange,
  listingCount,
  filteredCount,
}: MarketplaceHeroProps) {
  const countLabel =
    listingCount === 0
      ? "Listings go live as sellers publish"
      : filteredCount === listingCount
        ? `${listingCount.toLocaleString()} listing${listingCount === 1 ? "" : "s"} in the vault`
        : `${filteredCount.toLocaleString()} of ${listingCount.toLocaleString()} listings`;

  return (
    <section
      className="relative overflow-hidden border-b border-white/[0.07] bg-[linear-gradient(180deg,rgba(18,18,24,0.98)_0%,rgba(8,8,10,0.92)_100%)] after:pointer-events-none after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-gold/35 after:to-transparent sm:after:inset-x-6 lg:after:inset-x-10"
      aria-labelledby="marketplace-hero-title"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 top-0 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,rgba(201,162,39,0.16),transparent_68%)] blur-3xl" />
        <div className="absolute -right-24 top-12 h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(120,140,180,0.08),transparent_70%)] blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-8 pt-4 sm:px-4 sm:pb-10 sm:pt-5 lg:px-10 lg:pb-12 lg:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 transition hover:text-gold-bright"
          >
            ← Home
          </Link>
          <Link
            href="/sell/create"
            className="inline-flex rounded-full border border-gold/25 bg-gold/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gold-bright transition hover:border-gold/40 hover:bg-gold/10"
          >
            List in the vault →
          </Link>
        </div>

        <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-end lg:gap-10">
          <div className="min-w-0">
            <p className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-gold-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <span className="size-1.5 rounded-full bg-gold-bright shadow-[0_0_8px_rgba(201,162,39,0.55)]" aria-hidden />
              Get Vaulted marketplace
            </p>

            <h1 id="marketplace-hero-title" className="sr-only">
              Get Vaulted Marketplace
            </h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/white-logo.svg"
              alt=""
              width={468}
              height={132}
              className="h-auto w-[min(78vw,20rem)] sm:w-[min(52vw,22rem)] lg:w-[min(36vw,24rem)]"
              draggable={false}
              aria-hidden
            />

            <p className="mt-4 max-w-lg text-sm leading-relaxed text-zinc-400 sm:text-base">
              Slabs, grails, and collector-grade memorabilia—curated for people who care about condition, provenance,
              and the story behind every piece.
            </p>

            <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{countLabel}</p>

            <MarketplaceTrustStrip variant="hero" />
          </div>

          <div className="min-w-0">
            <label htmlFor="marketplace-hero-search" className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
              Search the vault
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-gold-bright/70">
                <SearchIcon className="size-4" aria-hidden />
              </span>
              <input
                id="marketplace-hero-search"
                type="search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Titles, sellers, grails…"
                className="h-12 w-full rounded-2xl border border-white/12 bg-[#0a0a0e]/90 pl-11 pr-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_16px_40px_-28px_rgba(0,0,0,0.85)] outline-none ring-gold/20 placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2"
              />
            </div>

            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Explore by category</p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Browse categories">
              {marketplaceCategories.map((c) => {
                const selected = c === category;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onCategoryChange(c)}
                    className={`rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition sm:text-[11px] ${
                      selected
                        ? "border-gold/50 bg-gold/15 text-gold-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_24px_-12px_rgba(201,162,39,0.45)]"
                        : "border-white/12 bg-white/[0.03] text-zinc-400 hover:border-gold/25 hover:bg-white/[0.05] hover:text-zinc-200"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
    </svg>
  );
}
