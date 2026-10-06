"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  title: string;
  category: string;
  status: string;
  buyingFormat: string;
  priceUsd: number;
  sellerId: string;
  sellerUsername: string;
  sellerEmail: string;
  isCompanyListing: boolean;
  channel: "marketplace" | "live";
  moderationRemovedAt: string | null;
  adminReviewedAt: string | null;
  createdAt: string;
};

const STATUS_OPTIONS = ["all", "draft", "active", "auction_live", "sold", "removed"] as const;
const CHANNEL_OPTIONS = [
  { id: "marketplace", label: "Marketplace" },
  { id: "live", label: "Live" },
] as const;
type Channel = (typeof CHANNEL_OPTIONS)[number]["id"];
type Status = (typeof STATUS_OPTIONS)[number];

function parseStatus(raw: string | null | undefined): Status {
  if (raw && (STATUS_OPTIONS as readonly string[]).includes(raw)) {
    return raw as Status;
  }
  return "all";
}

function parseChannel(raw: string | null | undefined): Channel {
  return raw === "live" ? "live" : "marketplace";
}

function parsePage(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function listingsHref(next: { status: Status; channel: Channel; page: number }): string {
  const sp = new URLSearchParams();
  if (next.status !== "all") sp.set("status", next.status);
  sp.set("channel", next.channel);
  if (next.page > 1) sp.set("page", String(next.page));
  const qs = sp.toString();
  return qs ? `/admin/listings?${qs}` : "/admin/listings";
}

export type AdminListingsPageProps = {
  initialStatus?: string | null;
  initialChannel?: string | null;
  initialPage?: string | null;
};

export function AdminListingsPage({
  initialStatus = null,
  initialChannel = null,
  initialPage = null,
}: AdminListingsPageProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(() => parseStatus(initialStatus));
  const [channel, setChannel] = useState<Channel>(() => parseChannel(initialChannel));
  const [category, setCategory] = useState("all");
  const [seller, setSeller] = useState("");
  const [page, setPage] = useState(() => parsePage(initialPage));
  const [categories, setCategories] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /** Update the address bar only from explicit user actions — never from a mount effect. */
  const pushFilters = useCallback(
    (next: { status: Status; channel: Channel; page: number }) => {
      const href = listingsHref(next);
      try {
        const current = `${window.location.pathname}${window.location.search}`;
        if (current === href) return;
      } catch {
        /* ignore */
      }
      router.replace(href, { scroll: false });
    },
    [router],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const sp = new URLSearchParams();
      sp.set("status", status);
      sp.set("channel", channel);
      sp.set("category", category);
      sp.set("page", String(page));
      sp.set("pageSize", "25");
      if (seller.trim()) sp.set("seller", seller.trim());
      const res = await fetch(`/api/admin/listings?${sp.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(typeof j.error === "string" ? j.error : `Could not load listings (${res.status}).`);
        setRows([]);
        setTotal(0);
        setTotalPages(1);
        return;
      }
      const j = (await res.json()) as {
        listings?: Row[];
        categories?: string[];
        total?: number;
        totalPages?: number;
        page?: number;
      };
      setRows(Array.isArray(j.listings) ? j.listings : []);
      setCategories(Array.isArray(j.categories) ? j.categories : []);
      setTotal(typeof j.total === "number" ? j.total : 0);
      setTotalPages(typeof j.totalPages === "number" ? Math.max(1, j.totalPages) : 1);
      if (typeof j.page === "number" && j.page !== page) setPage(j.page);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not load listings.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, channel, category, seller, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const setCompany = async (id: string, next: boolean) => {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/listings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompanyListing: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        await load();
        router.refresh();
      } else {
        setActionError(typeof data.error === "string" ? data.error : "Update failed.");
      }
    } finally {
      setBusyId(null);
    }
  };

  const act = async (id: string, action: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/listings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        await load();
        router.refresh();
      } else {
        setActionError(typeof data.error === "string" ? data.error : "Action failed.");
      }
    } finally {
      setBusyId(null);
    }
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * 25 + 1;
  const rangeEnd = Math.min(page * 25, total);

  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-4 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-black tracking-tight">Listings</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Filter and moderate listings. Marketplace and Live are separate queues — 25 per page.
          </p>
        </div>
        <Link
          href="/admin/listings/new"
          className="rounded-full border border-gold/35 bg-gold/10 px-4 py-2 text-xs font-bold text-gold-bright transition hover:bg-gold/15"
        >
          Create listing
        </Link>
      </div>
      {actionError ? (
        <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{actionError}</p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {CHANNEL_OPTIONS.map((opt) => {
          const active = channel === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setChannel(opt.id);
                setPage(1);
                pushFilters({ status, channel: opt.id, page: 1 });
              }}
              className={
                active
                  ? "rounded-full border border-gold/40 bg-gold/15 px-4 py-1.5 text-xs font-bold text-gold-bright"
                  : "rounded-full border border-white/10 bg-[#0a0a0d] px-4 py-1.5 text-xs font-semibold text-zinc-400 hover:border-white/20 hover:text-zinc-200"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Status
          <select
            value={status}
            onChange={(e) => {
              const next = e.target.value as Status;
              setStatus(next);
              setPage(1);
              pushFilters({ status: next, channel, page: 1 });
            }}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="min-w-[8rem] rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
          >
            <option value="all">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Seller (username, email, or id)
          <input
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            pushFilters({ status, channel, page: 1 });
            void load();
          }}
          className="rounded-lg border border-gold/35 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold-bright hover:bg-gold/15"
        >
          Apply
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
        <p>
          {channel === "live" ? "Live" : "Marketplace"} · showing {rangeStart}–{rangeEnd} of {total}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => {
              const next = Math.max(1, page - 1);
              setPage(next);
              pushFilters({ status, channel, page: next });
            }}
            className="rounded border border-white/15 px-2.5 py-1 text-[10px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={loading || page >= totalPages}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              pushFilters({ status, channel, page: next });
            }}
            className="rounded border border-white/15 px-2.5 py-1 text-[10px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80">
        <table className="w-full min-w-[880px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">Listing</th>
              <th className="px-3 py-2">Seller</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Flags</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-zinc-500">
                  No {channel === "live" ? "live" : "marketplace"} listings match.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.05] text-zinc-300">
                  <td className="max-w-[220px] px-3 py-2 align-top">
                    <Link
                      href={`/listing/${encodeURIComponent(r.id)}`}
                      className="font-medium text-zinc-100 hover:text-gold-bright hover:underline"
                    >
                      {r.title || "(untitled)"}
                    </Link>
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{r.id}</p>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="text-zinc-200">@{r.sellerUsername || "unknown"}</span>
                    <p className="text-[10px] text-zinc-600">{r.sellerEmail || "—"}</p>
                  </td>
                  <td className="px-3 py-2 align-top text-zinc-400">{r.category || "—"}</td>
                  <td className="px-3 py-2 align-top capitalize text-zinc-400">
                    {r.status}
                    <span className="mt-0.5 block text-[10px] text-zinc-600">{r.buyingFormat}</span>
                  </td>
                  <td className="px-3 py-2 align-top text-[10px] text-zinc-500">
                    {r.moderationRemovedAt ? (
                      <span className="text-rose-400">Removed</span>
                    ) : (
                      <span>Visible</span>
                    )}
                    {r.channel === "live" ? (
                      <span className="mt-1 block font-semibold text-fuchsia-300/90">Live show</span>
                    ) : (
                      <span className="mt-1 block text-zinc-600">Marketplace</span>
                    )}
                    {r.adminReviewedAt ? <span className="mt-1 block text-emerald-500/90">Reviewed</span> : null}
                    {r.isCompanyListing ? (
                      <span className="mt-1 block font-semibold text-sky-300/90">Merch</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.moderationRemovedAt ? (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void act(r.id, "restore")}
                          className="rounded border border-white/15 px-2 py-1 text-[10px] font-semibold text-zinc-200 hover:border-gold/30"
                        >
                          {busyId === r.id ? "Working…" : "Restore"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void act(r.id, "remove")}
                          className="rounded border border-rose-500/40 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
                        >
                          {busyId === r.id ? "Working…" : "Remove"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void act(r.id, "mark_reviewed")}
                        className="rounded border border-white/15 px-2 py-1 text-[10px] font-semibold text-zinc-200 hover:border-gold/30"
                      >
                        {busyId === r.id ? "Working…" : "Mark reviewed"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void setCompany(r.id, !r.isCompanyListing)}
                        className="rounded border border-sky-500/35 px-2 py-1 text-[10px] font-semibold text-sky-200 hover:bg-sky-500/10"
                      >
                        {busyId === r.id ? "…" : r.isCompanyListing ? "Unset merch" : "Set as merch"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2 text-[11px] text-zinc-500">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => {
              const next = Math.max(1, page - 1);
              setPage(next);
              pushFilters({ status, channel, page: next });
            }}
            className="rounded border border-white/15 px-2.5 py-1 text-[10px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={loading || page >= totalPages}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              pushFilters({ status, channel, page: next });
            }}
            className="rounded border border-white/15 px-2.5 py-1 text-[10px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </main>
  );
}
