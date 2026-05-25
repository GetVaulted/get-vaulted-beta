"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter: { username: string } | null;
};

export function AdminReportsPage() {
  const [status, setStatus] = useState("");
  const [targetType, setTargetType] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (status) sp.set("status", status);
      if (targetType) sp.set("targetType", targetType);
      if (appliedQ) sp.set("q", appliedQ);
      const res = await fetch(`/api/admin/reports?${sp}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { reports?: Row[] };
      setRows(Array.isArray(j.reports) ? j.reports : []);
    } finally {
      setLoading(false);
    }
  }, [status, targetType, appliedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-4 lg:px-10">
      <h1 className="font-display text-xl font-black tracking-tight">Moderation queue</h1>
      <p className="mt-1 text-xs text-zinc-500">User and content reports from web and mobile.</p>

      <div className="mt-6 flex flex-wrap items-end gap-2 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 p-4">
        <label className="text-[10px] font-bold uppercase text-zinc-500">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 block rounded-lg border border-white/[0.08] bg-[#08080a] px-2 py-1.5 text-xs text-zinc-200"
          >
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase text-zinc-500">
          Target
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className="mt-1 block rounded-lg border border-white/[0.08] bg-[#08080a] px-2 py-1.5 text-xs text-zinc-200"
          >
            <option value="">All</option>
            <option value="user">User</option>
            <option value="listing">Listing</option>
            <option value="live_room">Live room</option>
            <option value="message">Message</option>
            <option value="order">Order</option>
            <option value="break">Break</option>
          </select>
        </label>
        <label className="min-w-[12rem] flex-1 text-[10px] font-bold uppercase text-zinc-500">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setAppliedQ(q)}
            className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#08080a] px-2 py-1.5 text-xs text-zinc-200"
          />
        </label>
        <button
          type="button"
          onClick={() => setAppliedQ(q)}
          className="rounded-lg bg-gold/15 px-3 py-2 text-xs font-bold text-gold-bright"
        >
          Apply
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.08]">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/[0.06] bg-[#08080a] text-[10px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Reporter</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  No reports.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-3 py-2 font-mono text-zinc-400">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-zinc-300">
                    {r.targetType}
                    <span className="mt-0.5 block font-mono text-[10px] text-zinc-600">{r.targetId.slice(0, 12)}…</span>
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{r.reason.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 capitalize text-zinc-300">{r.status}</td>
                  <td className="px-3 py-2 text-zinc-400">@{r.reporter?.username ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/reports/${encodeURIComponent(r.id)}`} className="font-semibold text-gold-bright hover:underline">
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
