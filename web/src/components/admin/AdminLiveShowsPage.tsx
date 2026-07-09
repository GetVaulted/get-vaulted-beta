"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminButtonDangerClassName,
  adminButtonPrimaryClassName,
  adminPanelClassName,
  adminSelectClassName,
  adminTableClassName,
} from "@/components/admin/AdminCommandShell";
import { AdminCsvExportButton } from "@/components/admin/AdminCsvExportButton";

type ShowRow = {
  id: string;
  title: string;
  status: string;
  host: { username: string; email: string };
  viewerCount: number;
  bidCount: number;
  reportCount: number;
  streamHealth: string;
  streamMode: string;
  ivsChannelArn: string | null;
  ivsStageArn: string | null;
  lastIvsError: string | null;
  scheduledStartAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  completedSalesGmvUsd: number;
  auctionEventSeq: number;
  activeItem: { title: string; currentBidUsd: number | null; biddingOpen: boolean } | null;
  queuedItemCount: number;
  soldItemCount: number;
};

export function AdminLiveShowsPage() {
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<ShowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (status !== "all") sp.set("status", status);
      const res = await fetch(`/api/admin/live-shows?${sp}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { shows?: ShowRow[] };
      setRows(Array.isArray(j.shows) ? j.shows : []);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: "end" | "cancel" | "flag") => {
    const note =
      action === "flag"
        ? window.prompt("Problem flag note (optional):") ?? ""
        : window.prompt(`Reason for ${action} (optional):`) ?? "";
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/live-shows/${encodeURIComponent(id)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(j.error ?? "Action failed");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const streamTone = (health: string): "ok" | "warn" | "bad" | "neutral" => {
    if (health === "live") return "ok";
    if (health === "error") return "bad";
    if (health === "connecting") return "warn";
    return "neutral";
  };

  return (
    <AdminCommandShell
      title="Live Shows"
      subtitle="Monitor active, scheduled, and ended shows — IVS health, auctions, viewers, and admin controls."
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={adminSelectClassName}>
            <option value="all">All</option>
            <option value="live">Live</option>
            <option value="scheduled">Scheduled</option>
            <option value="ended">Ended</option>
          </select>
        </label>
        <AdminCsvExportButton report="live-shows" params={{ status: status === "all" ? undefined : status }} />
      </div>

      <div className={`mt-6 overflow-x-auto ${adminPanelClassName}`}>
        <table className={adminTableClassName}>
          <thead>
            <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <th>Show</th>
              <th>Host</th>
              <th>Status</th>
              <th>Stream</th>
              <th>IVS</th>
              <th>Auction</th>
              <th>Viewers</th>
              <th>Bids</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-zinc-500">
                  No shows in this bucket.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04] text-zinc-300">
                  <td>
                    <p className="font-semibold text-zinc-100">{r.title}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{r.id.slice(0, 10)}…</p>
                  </td>
                  <td>
                    <p>{r.host.username}</p>
                    <p className="text-[10px] text-zinc-600">{r.host.email}</p>
                  </td>
                  <td>
                    <AdminStatusPill tone={r.status === "live" ? "ok" : r.status === "scheduled" ? "warn" : "neutral"}>
                      {r.status}
                    </AdminStatusPill>
                  </td>
                  <td>
                    <AdminStatusPill tone={streamTone(r.streamHealth)}>{r.streamHealth}</AdminStatusPill>
                    <p className="mt-1 text-[10px] text-zinc-600">{r.streamMode}</p>
                    {r.lastIvsError ? <p className="mt-1 max-w-[12rem] truncate text-[10px] text-rose-400">{r.lastIvsError}</p> : null}
                  </td>
                  <td className="text-[10px] text-zinc-500">
                    <p>{r.ivsStageArn ? "Stage ✓" : r.ivsChannelArn ? "Channel ✓" : "—"}</p>
                    <p className="mt-1">seq {r.auctionEventSeq}</p>
                  </td>
                  <td>
                    {r.activeItem ? (
                      <>
                        <p className="max-w-[10rem] truncate text-zinc-200">{r.activeItem.title}</p>
                        <p className="text-[10px] text-zinc-500">
                          ${r.activeItem.currentBidUsd ?? 0} · {r.activeItem.biddingOpen ? "open" : "closed"}
                        </p>
                      </>
                    ) : (
                      <p className="text-zinc-600">No active lot</p>
                    )}
                    <p className="text-[10px] text-zinc-600">
                      Q{r.queuedItemCount} · S{r.soldItemCount}
                    </p>
                  </td>
                  <td>{r.viewerCount}</td>
                  <td>{r.bidCount}</td>
                  <td className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Link href={`/live/${r.id}`} className={adminButtonPrimaryClassName} target="_blank">
                        View
                      </Link>
                      {r.status === "live" ? (
                        <button type="button" disabled={busyId === r.id} className={adminButtonDangerClassName} onClick={() => void act(r.id, "end")}>
                          End
                        </button>
                      ) : null}
                      {r.status !== "ended" ? (
                        <button type="button" disabled={busyId === r.id} className={adminButtonDangerClassName} onClick={() => void act(r.id, "cancel")}>
                          Cancel
                        </button>
                      ) : null}
                      <button type="button" disabled={busyId === r.id} className={adminButtonPrimaryClassName} onClick={() => void act(r.id, "flag")}>
                        Flag
                      </button>
                      {r.reportCount > 0 ? (
                        <Link href="/admin/trust" className="text-[10px] text-amber-400 underline">
                          {r.reportCount} reports
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminCommandShell>
  );
}
