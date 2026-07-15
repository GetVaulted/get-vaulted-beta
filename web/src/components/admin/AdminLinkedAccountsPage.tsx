"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminPanelClassName,
  adminTableClassName,
} from "@/components/admin/AdminCommandShell";

type ClusterUser = {
  id: string;
  username: string;
  email: string;
  suspendedAt: string | null;
  createdAt: string;
};

type Cluster = {
  id: string;
  score: number;
  reasonSummary: string;
  users: ClusterUser[];
  signals: Array<{ kind: string; label: string; evidence: string; weight: number }>;
};

type Payload = { clusters: Cluster[]; scannedAt: string };

export function AdminLinkedAccountsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trust/linked-accounts", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load linked-account clusters.");
        setData(null);
        return;
      }
      setData((await res.json()) as Payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminCommandShell
      title="Possible linked accounts"
      subtitle="Review-only. Clusters share Stripe IDs, payment methods, push tokens, or email aliases. Does not auto-ban."
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]"
          >
            Rescan
          </button>
          <Link
            href="/admin/trust"
            className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold-bright hover:bg-gold/25"
          >
            ← Trust
          </Link>
        </div>
      }
    >
      {loading ? <p className="text-sm text-zinc-500">Scanning first-party signals…</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {!loading && data ? (
        <>
          <p className="text-xs text-zinc-500">
            {data.clusters.length} cluster{data.clusters.length === 1 ? "" : "s"} · scanned{" "}
            {new Date(data.scannedAt).toLocaleString()}
          </p>
          <div className={`mt-4 overflow-x-auto ${adminPanelClassName}`}>
            <table className={adminTableClassName}>
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-zinc-500">
                  <th>Score</th>
                  <th>Reason</th>
                  <th>Accounts</th>
                  <th>Signals</th>
                </tr>
              </thead>
              <tbody>
                {data.clusters.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-zinc-500">
                      No multi-account clusters found in the current scan window.
                    </td>
                  </tr>
                ) : (
                  data.clusters.map((c) => (
                    <tr key={c.id} className="border-b border-white/[0.06] align-top">
                      <td className="tabular-nums font-semibold text-amber-200">{c.score}</td>
                      <td className="text-zinc-200">{c.reasonSummary}</td>
                      <td>
                        <ul className="space-y-1">
                          {c.users.map((u) => (
                            <li key={u.id}>
                              <Link
                                href={`/admin/users/${encodeURIComponent(u.id)}`}
                                className="font-semibold text-gold-bright hover:underline"
                              >
                                @{u.username}
                              </Link>
                              <span className="ml-2 text-zinc-500">{u.email}</span>
                              {u.suspendedAt ? (
                                <span className="ml-2">
                                  <AdminStatusPill tone="bad">Suspended</AdminStatusPill>
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="text-zinc-400">
                        {c.signals.map((s) => s.label).join(", ")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </AdminCommandShell>
  );
}
