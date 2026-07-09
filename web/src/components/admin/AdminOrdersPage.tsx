"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCsvExportButton } from "@/components/admin/AdminCsvExportButton";

type Row = {
  id: string;
  status: string;
  totalUsd: number;
  createdAt: string;
  listingId: string;
  listingTitle: string;
  buyerUsername: string;
  sellerUsername: string;
};

export function AdminOrdersPage() {
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (status !== "all") sp.set("status", status);
      const res = await fetch(`/api/admin/orders?${sp.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { orders?: Row[] };
      setRows(Array.isArray(j.orders) ? j.orders : []);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-4 lg:px-10">
      <h1 className="font-display text-xl font-black tracking-tight">Orders</h1>
      <p className="mt-1 text-xs text-zinc-500">Filter by order status and open a record.</p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
          >
            <option value="all">All</option>
            <option value="pending">pending</option>
            <option value="paid">paid</option>
            <option value="shipped">shipped</option>
            <option value="completed">completed</option>
            <option value="cancelled">cancelled</option>
          </select>
        </label>
        <AdminCsvExportButton report="orders" params={{ status }} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Listing</th>
              <th className="px-3 py-2">Parties</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2 text-right">Detail</th>
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
                  No orders match.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.05] text-zinc-300">
                  <td className="px-3 py-2 align-top">
                    <span className="font-mono text-[10px] text-zinc-400">{r.id}</span>
                    <p className="mt-0.5 capitalize text-zinc-200">{r.status}</p>
                  </td>
                  <td className="max-w-[200px] px-3 py-2 align-top text-zinc-400">{r.listingTitle}</td>
                  <td className="px-3 py-2 align-top text-[10px] text-zinc-500">
                    <span className="text-zinc-300">B @{r.buyerUsername}</span>
                    <span className="mx-1 text-zinc-700">·</span>
                    <span className="text-zinc-300">S @{r.sellerUsername}</span>
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums text-zinc-200">
                    {r.totalUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-3 py-2 align-top text-[10px] text-zinc-600">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <Link href={`/admin/orders/${encodeURIComponent(r.id)}`} className="text-[10px] font-semibold text-gold-bright hover:underline">
                      Open
                    </Link>
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
