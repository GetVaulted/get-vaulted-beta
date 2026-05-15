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
  moderationRemovedAt: string | null;
  adminReviewedAt: string | null;
  createdAt: string;
};

const STATUS_OPTIONS = ["all", "draft", "active", "auction_live", "sold", "removed"] as const;

export function AdminListingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [category, setCategory] = useState("all");
  const [seller, setSeller] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set("status", status);
      sp.set("category", category);
      if (seller.trim()) sp.set("seller", seller.trim());
      const res = await fetch(`/api/admin/listings?${sp.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { listings?: Row[]; categories?: string[] };
      setRows(Array.isArray(j.listings) ? j.listings : []);
      setCategories(Array.isArray(j.categories) ? j.categories : []);
    } finally {
      setLoading(false);
    }
  }, [status, category, seller]);

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

  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-4 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-black tracking-tight">Listings</h1>
          <p className="mt-1 text-xs text-zinc-500">Filter and moderate listings. Create normal or company merch listings.</p>
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

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as (typeof STATUS_OPTIONS)[number])}
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
            onChange={(e) => setCategory(e.target.value)}
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
          onClick={() => void load()}
          className="rounded-lg border border-gold/35 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold-bright hover:bg-gold/15"
        >
          Apply
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80">
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
                  No listings match.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.05] text-zinc-300">
                  <td className="max-w-[220px] px-3 py-2 align-top">
                    <Link href={`/marketplace/${encodeURIComponent(r.id)}`} className="font-medium text-zinc-100 hover:text-gold-bright hover:underline">
                      {r.title}
                    </Link>
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{r.id}</p>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="text-zinc-200">@{r.sellerUsername}</span>
                    <p className="text-[10px] text-zinc-600">{r.sellerEmail}</p>
                  </td>
                  <td className="px-3 py-2 align-top text-zinc-400">{r.category}</td>
                  <td className="px-3 py-2 align-top capitalize text-zinc-400">
                    {r.status}
                    <span className="mt-0.5 block text-[10px] text-zinc-600">{r.buyingFormat}</span>
                  </td>
                  <td className="px-3 py-2 align-top text-[10px] text-zinc-500">
                    {r.moderationRemovedAt ? <span className="text-rose-400">Removed</span> : <span>Live</span>}
                    {r.adminReviewedAt ? <span className="mt-1 block text-emerald-500/90">Reviewed</span> : null}
                    {r.isCompanyListing ? <span className="mt-1 block font-semibold text-sky-300/90">Merch</span> : null}
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
    </main>
  );
}
