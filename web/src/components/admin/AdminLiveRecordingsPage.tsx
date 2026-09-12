"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminButtonDangerClassName,
  adminButtonPrimaryClassName,
  adminPanelClassName,
  adminTableClassName,
} from "@/components/admin/AdminCommandShell";

type ReplayRow = {
  id: string;
  liveRoomId: string;
  showTitle: string | null;
  sellerUsername: string | null;
  sellerEmail: string | null;
  recordingStatus: string;
  archiveStatus: string;
  recordingError: string | null;
  durationSeconds: number | null;
  endedAt: string;
  daysRemaining: number;
};

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}m ${s}s`;
}

function recordingTone(status: string): "ok" | "warn" | "bad" | "neutral" {
  if (status === "ready") return "ok";
  if (status === "recording" || status === "pending") return "warn";
  if (status === "failed" || status === "expired") return "bad";
  return "neutral";
}

export function AdminLiveRecordingsPage() {
  const [rows, setRows] = useState<ReplayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/replays", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { replays?: ReplayRow[] };
      setRows(Array.isArray(j.replays) ? j.replays : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const prepareArchive = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/replays/${encodeURIComponent(id)}/archive`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string; archiveStatus?: string };
      if (!res.ok) {
        setMessage(j.error ?? "Prepare ZIP failed");
        return;
      }
      setMessage(j.archiveStatus === "ready" ? "ZIP already ready." : "ZIP preparing — refresh and download shortly.");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const download = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/replays/${encodeURIComponent(id)}/download`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
        preparing?: boolean;
        message?: string;
      };
      if (res.status === 202 || j.preparing) {
        setMessage(j.message ?? "Archive is preparing. Try again in a minute.");
        await load();
        return;
      }
      if (!res.ok || !j.url) {
        setMessage(j.error ?? "Download failed");
        return;
      }
      window.open(j.url, "_blank", "noopener,noreferrer");
      setMessage("Download link opened (expires in ~1 hour).");
    } finally {
      setBusyId(null);
    }
  };

  const preview = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/replays/${encodeURIComponent(id)}/preview`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok || !j.url) {
        setMessage(j.error ?? "Preview unavailable");
        return;
      }
      window.open(j.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusyId(null);
    }
  };

  const softDelete = async (id: string) => {
    if (!window.confirm("Hide this recording from the admin list? S3 media still expires on the 30-day lifecycle.")) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/replays/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(j.error ?? "Delete failed");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminCommandShell
      title="Live Recordings"
      subtitle="IVS auto-recordings retained for 30 days. Prepare a ZIP to download and store externally before expiry."
    >
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={adminButtonPrimaryClassName} onClick={() => void load()}>
          Refresh
        </button>
        <Link href="/admin/live-shows" className="text-sm text-zinc-400 underline-offset-2 hover:underline">
          ← Live Shows
        </Link>
        {message ? <p className="text-sm text-amber-300/90">{message}</p> : null}
      </div>

      <div className={`mt-6 overflow-x-auto ${adminPanelClassName}`}>
        <table className={adminTableClassName}>
          <thead>
            <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <th>Show</th>
              <th>Seller</th>
              <th>Ended</th>
              <th>Duration</th>
              <th>Recording</th>
              <th>Archive</th>
              <th>Days left</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-zinc-500">
                  No recordings in the retention window.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04] text-zinc-300">
                  <td>
                    <p className="font-semibold text-zinc-100">{r.showTitle || "Untitled show"}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{r.liveRoomId.slice(0, 12)}…</p>
                  </td>
                  <td>
                    <p>{r.sellerUsername || "—"}</p>
                    <p className="text-[10px] text-zinc-600">{r.sellerEmail}</p>
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {new Date(r.endedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>{formatDuration(r.durationSeconds)}</td>
                  <td>
                    <AdminStatusPill tone={recordingTone(r.recordingStatus)}>{r.recordingStatus}</AdminStatusPill>
                    {r.recordingError ? (
                      <p className="mt-1 max-w-[12rem] truncate text-[10px] text-rose-400" title={r.recordingError}>
                        {r.recordingError}
                      </p>
                    ) : null}
                  </td>
                  <td>
                    <AdminStatusPill
                      tone={
                        r.archiveStatus === "ready" ? "ok" : r.archiveStatus === "failed" ? "bad" : r.archiveStatus === "preparing" ? "warn" : "neutral"
                      }
                    >
                      {r.archiveStatus}
                    </AdminStatusPill>
                  </td>
                  <td>
                    <span className={r.daysRemaining <= 3 ? "font-semibold text-amber-300" : ""}>{r.daysRemaining}d</span>
                  </td>
                  <td className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {r.recordingStatus === "ready" ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            className={adminButtonPrimaryClassName}
                            onClick={() => void preview(r.id)}
                          >
                            Preview
                          </button>
                          {r.archiveStatus !== "ready" ? (
                            <button
                              type="button"
                              disabled={busyId === r.id || r.archiveStatus === "preparing"}
                              className={adminButtonPrimaryClassName}
                              onClick={() => void prepareArchive(r.id)}
                            >
                              {r.archiveStatus === "preparing" ? "Preparing…" : "Prepare ZIP"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            className={adminButtonPrimaryClassName}
                            onClick={() => void download(r.id)}
                          >
                            Download
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        className={adminButtonDangerClassName}
                        onClick={() => void softDelete(r.id)}
                      >
                        Hide
                      </button>
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
