"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import { effectiveSellerListingStatus, type SellerListingStatus, type StoredUserListing } from "@/lib/user-listings-storage";
import { SellerOffersModal } from "@/components/account/SellerOffersModal";
import { ExpiredAuctionRecoveryPanel } from "@/components/listings/ExpiredAuctionRecoveryPanel";
import { PaymentDeadlineCountdown } from "@/components/orders/PaymentDeadlineCountdown";

type TabKey = "all" | "active" | "drafts" | "sold" | "auctions" | "offers";
type SortKey = "updated" | "created" | "price-desc" | "price-asc";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "drafts", label: "Drafts" },
  { key: "sold", label: "Sold" },
  { key: "auctions", label: "Auctions" },
  { key: "offers", label: "Offers" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "updated", label: "Recently updated" },
  { key: "created", label: "Recently created" },
  { key: "price-desc", label: "Price: High to low" },
  { key: "price-asc", label: "Price: Low to high" },
];

function FulfillmentWarningsNotice({ warnings }: { warnings?: StoredUserListing["fulfillmentWarnings"] }) {
  if (!warnings?.length) return null;
  return (
    <ul className="mt-2 space-y-1 rounded-lg border border-amber-500/25 bg-amber-950/20 px-2 py-2 text-[10px] leading-snug text-amber-100/95">
      <li className="font-bold uppercase tracking-wide text-amber-200/80">Shipping readiness</li>
      {warnings.map((w) => (
        <li key={w.code} className={w.severity === "error" ? "text-rose-200" : "text-amber-100/90"}>
          {w.message}
        </li>
      ))}
    </ul>
  );
}

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatShortDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function statusLabel(st: SellerListingStatus): string {
  if (st === "ended") return "Ended";
  if (st === "auction_live") return "Auction live";
  if (st === "awaiting_auction_payment") return "Auction ended — payment pending";
  if (st === "auction_ended_unpaid") return "Payment expired";
  return st.charAt(0).toUpperCase() + st.slice(1);
}

function statusTone(st: SellerListingStatus): string {
  if (st === "active") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200/95";
  if (st === "draft") return "border-zinc-500/25 bg-zinc-800/40 text-zinc-300";
  if (st === "ended") return "border-zinc-500/25 bg-zinc-900/50 text-zinc-400";
  if (st === "sold") return "border-rose-400/25 bg-rose-950/35 text-rose-100/90";
  if (st === "awaiting_auction_payment") return "border-amber-400/25 bg-amber-950/35 text-amber-100/90";
  if (st === "auction_ended_unpaid") return "border-rose-400/25 bg-rose-950/30 text-rose-100/90";
  return "border-amber-400/25 bg-amber-950/30 text-amber-100/90";
}

function displayPriceRow(l: StoredUserListing): string {
  if (l.buyingFormat === "auction") {
    const bid = l.displayBid ?? l.startingBid ?? l.price;
    const n = l.auctionBidCount ?? 0;
    return `${formatMoney(bid)} · ${n} ${n === 1 ? "bid" : "bids"}`;
  }
  return formatMoney(l.price);
}

function notifyListingsUpdated() {
  window.dispatchEvent(new Event("gv-listings-updated"));
}

export function MyListingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [rows, setRows] = useState<StoredUserListing[]>([]);
  const [listLoadError, setListLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [query, setQuery] = useState("");
  const [offersFor, setOffersFor] = useState<StoredUserListing | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!session?.user?.id) {
      setRows([]);
      return;
    }
    setListLoadError(null);
    const res = await fetch("/api/listings?scope=mine");
    if (!res.ok) {
      setListLoadError(res.status === 401 ? "Session expired — sign in again." : "Could not load your listings.");
      setRows([]);
      return;
    }
    const data = (await res.json()) as { listings?: StoredUserListing[] };
    setRows(Array.isArray(data.listings) ? data.listings : []);
  }, [session?.user?.id]);

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = encodeURIComponent(pathname || "/account/listings");
      router.replace(`/signin?returnTo=${next}`);
      return;
    }
    if (status !== "authenticated") return;
    const frame = requestAnimationFrame(() => {
      void reload();
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, reload, router, status]);

  useEffect(() => {
    const on = () => reload();
    window.addEventListener("gv-listings-updated", on);
    window.addEventListener("gv-offers-updated", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("gv-listings-updated", on);
      window.removeEventListener("gv-offers-updated", on);
      window.removeEventListener("storage", on);
    };
  }, [reload]);

  const stats = useMemo(() => {
    const active = rows.filter((l) => effectiveSellerListingStatus(l) === "active").length;
    const drafts = rows.filter((l) => effectiveSellerListingStatus(l) === "draft").length;
    const sold = rows.filter((l) => effectiveSellerListingStatus(l) === "sold").length;
    const auctions = rows.filter((l) => effectiveSellerListingStatus(l) === "auction_live").length;
    const offersRecv = rows.reduce((a, l) => a + (l.pendingOffersCount ?? 0), 0);
    return { active, drafts, sold, auctions, offersRecv };
  }, [rows]);

  const filtered = useMemo(() => {
    let list = [...rows];
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((l) => l.title.toLowerCase().includes(q) || l.category.toLowerCase().includes(q));

    if (tab === "active") list = list.filter((l) => effectiveSellerListingStatus(l) === "active");
    if (tab === "drafts") list = list.filter((l) => effectiveSellerListingStatus(l) === "draft");
    if (tab === "sold") list = list.filter((l) => effectiveSellerListingStatus(l) === "sold");
    if (tab === "auctions") list = list.filter((l) => effectiveSellerListingStatus(l) === "auction_live");
    if (tab === "offers") list = list.filter((l) => (l.pendingOffersCount ?? 0) > 0);

    const parseT = (iso: string) => new Date(iso).getTime();
    list.sort((a, b) => {
      if (sort === "updated") return parseT(b.updatedAt ?? b.listedAt) - parseT(a.updatedAt ?? a.listedAt);
      if (sort === "created") return parseT(b.listedAt) - parseT(a.listedAt);
      const pa = a.buyingFormat === "auction" ? a.displayBid ?? a.price : a.price;
      const pb = b.buyingFormat === "auction" ? b.displayBid ?? b.price : b.price;
      if (sort === "price-desc") return pb - pa;
      return pa - pb;
    });
    return list;
  }, [query, rows, sort, tab]);

  if (status === "loading") {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  if (status === "unauthenticated" || !session?.user) return null;

  const statCards = [
    { label: "Active listings", value: stats.active },
    { label: "Drafts", value: stats.drafts },
    { label: "Sold", value: stats.sold },
    { label: "Offers received", value: stats.offersRecv },
    { label: "Auctions live", value: stats.auctions },
  ] as const;

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(360px,50vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.06),transparent_55%)]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <header className="border-b border-white/[0.07] pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Seller</p>
              <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">My Listings</h1>
              <p className="mt-1.5 max-w-xl text-sm text-zinc-500">Manage your active, draft, sold, and auction listings.</p>
              <div className="mt-4">
                <AccountOrdersNav active="listings" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/sell/create"
                className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-5 text-sm font-bold text-zinc-950 shadow-[0_0_24px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110"
              >
                Create listing
              </Link>
              <Link
                href="/marketplace"
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/[0.12] px-5 text-sm font-medium text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
              >
                View marketplace
              </Link>
            </div>
          </div>
        </header>

        {listLoadError ? (
          <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-950/25 px-5 py-6 sm:px-6">
            <p className="text-sm font-medium text-rose-100">{listLoadError}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void reload()}
                className="inline-flex h-10 items-center justify-center rounded-full border border-rose-300/35 px-5 text-xs font-bold uppercase tracking-wide text-rose-50 transition hover:bg-rose-500/10"
              >
                Retry
              </button>
              <Link
                href="/account/seller"
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/12 px-5 text-xs font-semibold text-zinc-300 transition hover:border-white/20"
              >
                Seller settings
              </Link>
            </div>
          </div>
        ) : null}

        <section
          className={`mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3 ${listLoadError ? "opacity-40" : ""}`}
          aria-label="Summary"
        >
          {statCards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:px-4 sm:py-3.5"
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{c.label}</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground sm:text-2xl">{c.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 space-y-4" aria-label="Filters">
          <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => {
              const sel = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition sm:text-xs ${
                    sel
                      ? "border-gold/45 bg-gold/12 text-gold-bright"
                      : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative min-w-0 flex-1 sm:max-w-xs">
              <span className="sr-only">Search listings</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search listings…"
                className="h-10 w-full rounded-lg border border-white/10 bg-[#0c0c10] pl-3 pr-3 text-sm text-foreground outline-none ring-gold/15 placeholder:text-zinc-600 focus:border-gold/35 focus:ring-2"
              />
            </label>
            <div className="shrink-0 sm:w-56">
              <label htmlFor="listing-sort" className="sr-only">
                Sort
              </label>
              <select
                id="listing-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/35 focus:ring-2"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="mt-6" aria-label="Your listings">
          {listLoadError ? null : rows.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-16 text-center">
              <p className="font-display text-lg font-semibold text-foreground">You haven’t created any listings yet.</p>
              <p className="mt-2 text-sm text-zinc-500">When you publish or save drafts, they’ll show up here.</p>
              <Link
                href="/sell/create"
                className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110"
              >
                Create your first listing
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-12 text-center">
              <p className="text-sm font-medium text-zinc-300">No listings match your filters.</p>
              <button
                type="button"
                onClick={() => {
                  setTab("all");
                  setQuery("");
                }}
                className="mt-4 text-xs font-semibold text-gold-bright hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-xl border border-white/[0.08] bg-[#08080a] md:block">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                      <th className="px-3 py-2.5 pl-3.5">Listing</th>
                      <th className="px-2 py-2.5">Category</th>
                      <th className="px-2 py-2.5">Format</th>
                      <th className="px-2 py-2.5">Price</th>
                      <th className="px-2 py-2.5">Status</th>
                      <th className="px-2 py-2.5">Views</th>
                      <th className="px-2 py-2.5">Created</th>
                      <th className="px-3 py-2.5 pr-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => {
                      const st = effectiveSellerListingStatus(l);
                      const showRecovery = st === "auction_ended_unpaid";
                      const thumb = l.imageDataUrls[0];
                      const offers = l.pendingOffersCount ?? 0;
                      return (
                        <Fragment key={l.id}>
                        <tr className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                          <td className="px-3 py-2 pl-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="relative size-11 shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#0b0b0e]">
                                {thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-[9px] text-zinc-600">—</div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="line-clamp-2 font-medium leading-snug text-zinc-100">{l.title}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  {l.allowOffers === true ? (
                                    <span className="rounded border border-gold/25 bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold-bright">
                                      Offers on
                                    </span>
                                  ) : null}
                                  {l.minimumOfferUsd != null ? (
                                    <span className="text-[9px] text-zinc-600">Min offer {formatMoney(l.minimumOfferUsd)}</span>
                                  ) : null}
                                  {offers > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => setOffersFor(l)}
                                      className="rounded border border-rose-400/30 bg-rose-950/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-100/90 transition hover:bg-rose-950/40"
                                    >
                                      {offers} {offers === 1 ? "offer" : "offers"}
                                    </button>
                                  ) : null}
                                </div>
                                <FulfillmentWarningsNotice warnings={l.fulfillmentWarnings} />
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-xs text-zinc-400">{l.category}</td>
                          <td className="px-2 py-2 text-xs text-zinc-400">{l.buyingFormat === "buy_now" ? "Buy now" : "Auction"}</td>
                          <td className="px-2 py-2 font-mono text-xs font-semibold tabular-nums text-zinc-200">{displayPriceRow(l)}</td>
                          <td className="px-2 py-2">
                            <span className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusTone(st)}`}>
                              {statusLabel(st)}
                            </span>
                            {st === "awaiting_auction_payment" && l.auctionPaymentDeadlineIso ? (
                              <p className="mt-1 text-[10px] text-zinc-500">
                                Winner has 30 minutes to pay ·{" "}
                                <PaymentDeadlineCountdown deadlineIso={l.auctionPaymentDeadlineIso} />
                              </p>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-xs tabular-nums text-zinc-500">
                            {l.views ?? "—"}
                            <span className="text-zinc-700"> · </span>
                            {l.watchers ?? "—"} w
                          </td>
                          <td className="px-2 py-2 text-xs tabular-nums text-zinc-500">{formatShortDate(l.listedAt)}</td>
                          <td className="px-3 py-2 pr-3.5 text-right">
                            <RowActionsDesktop
                              listing={l}
                              status={st}
                              onChanged={() => {
                                reload();
                                notifyListingsUpdated();
                                router.refresh();
                              }}
                            />
                          </td>
                        </tr>
                        {showRecovery ? (
                          <tr className="border-b border-white/[0.05] bg-rose-950/5 last:border-0">
                            <td colSpan={8} className="px-3 py-3 pl-3.5 pr-3.5">
                              <ExpiredAuctionRecoveryPanel listingId={l.id} compact onDone={() => void reload()} />
                            </td>
                          </tr>
                        ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {filtered.map((l) => {
                  const st = effectiveSellerListingStatus(l);
                  const showRecovery = st === "auction_ended_unpaid";
                  const thumb = l.imageDataUrls[0];
                  const offers = l.pendingOffersCount ?? 0;
                  const menuOpen = menuOpenId === l.id;
                  return (
                    <div key={l.id} className="rounded-xl border border-white/[0.08] bg-[#0a0a0d] p-3.5">
                      <div className="flex gap-3">
                        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0b0b0e]">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">—</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-snug text-zinc-100">{l.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
                            <span>{l.category}</span>
                            <span className="text-zinc-700">·</span>
                            <span>{l.buyingFormat === "buy_now" ? "Buy now" : "Auction"}</span>
                            <span className="text-zinc-700">·</span>
                            <span className="font-mono font-semibold text-zinc-300">{displayPriceRow(l)}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusTone(st)}`}>
                              {statusLabel(st)}
                            </span>
                            {l.allowOffers === true ? (
                              <span className="rounded border border-gold/25 bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gold-bright">Offers</span>
                            ) : null}
                            {offers > 0 ? (
                              <button
                                type="button"
                                onClick={() => setOffersFor(l)}
                                className="rounded border border-rose-400/30 bg-rose-950/25 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-100"
                              >
                                {offers} offers
                              </button>
                            ) : null}
                          </div>
                          {st === "awaiting_auction_payment" && l.auctionPaymentDeadlineIso ? (
                            <p className="mt-1.5 text-[10px] text-zinc-500">
                              Winner has 30 minutes to pay ·{" "}
                              <PaymentDeadlineCountdown deadlineIso={l.auctionPaymentDeadlineIso} />
                            </p>
                          ) : null}
                          <FulfillmentWarningsNotice warnings={l.fulfillmentWarnings} />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                        <Link
                          href={`/sell/create?edit=${encodeURIComponent(l.id)}`}
                          className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-xs font-semibold text-zinc-200"
                        >
                          Edit
                        </Link>
                        <Link
                          href={
                            effectiveSellerListingStatus(l) === "draft"
                              ? `/sell/create?edit=${encodeURIComponent(l.id)}`
                              : `/marketplace/${encodeURIComponent(l.id)}`
                          }
                          className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-xs font-semibold text-gold-bright"
                        >
                          View
                        </Link>
                        <div className="relative flex-1 min-w-[5rem]">
                          <button
                            type="button"
                            onClick={() => setMenuOpenId(menuOpen ? null : l.id)}
                            className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-white/10 text-xs font-medium text-zinc-400"
                            aria-expanded={menuOpen}
                          >
                            More
                          </button>
                          {menuOpen ? (
                            <MobileOverflowMenu
                              listing={l}
                              status={st}
                              onClose={() => setMenuOpenId(null)}
                              onChanged={() => {
                                setMenuOpenId(null);
                                reload();
                                notifyListingsUpdated();
                                router.refresh();
                              }}
                            />
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] text-zinc-600">Created {formatShortDate(l.listedAt)}</p>
                      {showRecovery ? (
                        <div className="mt-3 border-t border-white/[0.06] pt-3">
                          <ExpiredAuctionRecoveryPanel listingId={l.id} compact onDone={() => void reload()} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      <SellerOffersModal
        open={Boolean(offersFor)}
        onClose={() => setOffersFor(null)}
        listingId={offersFor?.id ?? null}
        listingTitle={offersFor?.title ?? ""}
        onChanged={() => {
          void reload();
          notifyListingsUpdated();
          router.refresh();
        }}
      />
    </main>
  );
}

function RowActionsDesktop({
  listing,
  status,
  onChanged,
}: {
  listing: StoredUserListing;
  status: SellerListingStatus;
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link
        href={`/sell/create?edit=${encodeURIComponent(listing.id)}`}
        className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-gold/35 hover:text-gold-bright"
      >
        Edit
      </Link>
      <Link
        href={
          effectiveSellerListingStatus(listing) === "draft"
            ? `/sell/create?edit=${encodeURIComponent(listing.id)}`
            : `/marketplace/${encodeURIComponent(listing.id)}`
        }
        className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-white/20"
      >
        View
      </Link>
      <button
        type="button"
        onClick={() => {
          void (async () => {
            const res = await fetch("/api/listings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ duplicateFromId: listing.id }),
            });
            if (res.ok) onChanged();
          })();
        }}
        className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-white/20"
      >
        Duplicate
      </button>
      {status !== "sold" && status !== "draft" ? (
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const res = await fetch(`/api/listings/${encodeURIComponent(listing.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "sold" }),
              });
              if (res.ok) onChanged();
            })();
          }}
          className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-emerald-400/30 hover:text-emerald-200/90"
        >
          Mark sold
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (!window.confirm("Delete this listing? This cannot be undone.")) return;
          void (async () => {
            const res = await fetch(`/api/listings/${encodeURIComponent(listing.id)}`, { method: "DELETE" });
            if (res.ok) onChanged();
          })();
        }}
        className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-rose-300/90 transition hover:border-rose-400/35"
      >
        Delete
      </button>
    </div>
  );
}

function MobileOverflowMenu({
  listing,
  status,
  onClose,
  onChanged,
}: {
  listing: StoredUserListing;
  status: SellerListingStatus;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <ul className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[10.5rem] rounded-lg border border-white/[0.1] bg-[#111114] py-1 shadow-xl">
      <li>
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.04]"
          onClick={() => {
            void (async () => {
              const res = await fetch("/api/listings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ duplicateFromId: listing.id }),
              });
              if (res.ok) onChanged();
            })();
          }}
        >
          Duplicate
        </button>
      </li>
      {status !== "sold" && status !== "draft" ? (
        <li>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.04]"
            onClick={() => {
              void (async () => {
                const res = await fetch(`/api/listings/${encodeURIComponent(listing.id)}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "sold" }),
                });
                if (res.ok) onChanged();
              })();
            }}
          >
            Mark sold
          </button>
        </li>
      ) : null}
      <li>
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-xs text-rose-300/90 hover:bg-white/[0.04]"
          onClick={() => {
            if (!window.confirm("Delete this listing?")) return;
            void (async () => {
              const res = await fetch(`/api/listings/${encodeURIComponent(listing.id)}`, { method: "DELETE" });
              if (res.ok) onChanged();
            })();
          }}
        >
          Delete
        </button>
      </li>
      <li className="border-t border-white/[0.06]">
        <button type="button" className="w-full px-3 py-2 text-left text-xs text-zinc-500 hover:bg-white/[0.04]" onClick={onClose}>
          Cancel
        </button>
      </li>
    </ul>
  );
}
