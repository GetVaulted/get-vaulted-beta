"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";
import { refundRequestStatusLabel } from "@/lib/order-refund-eligibility";
import type { OrderRefundRequestDto } from "@/lib/order-refund-types";

type QueueRow = OrderRefundRequestDto & {
  orderTotalUsd: number;
  listingTitle: string;
  buyerUsername: string;
  sellerUsername: string;
};

type StuckQueueRow = QueueRow & { stuckForMs: number };

function formatStuckDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function AdminRefundRequestsPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [stuckRows, setStuckRows] = useState<StuckQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [retryError, setRetryError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/refund-requests", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { requests?: QueueRow[]; stuckRequests?: StuckQueueRow[] };
      setRows(Array.isArray(j.requests) ? j.requests : []);
      setStuckRows(Array.isArray(j.stuckRequests) ? j.stuckRequests : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, approve: boolean) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/refund-requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, note: note[id] ?? "" }),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  async function retryStuck(id: string) {
    setBusyId(id);
    setRetryError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/refund-requests/${encodeURIComponent(id)}/retry`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        await load();
      } else {
        setRetryError((prev) => ({ ...prev, [id]: j.error ?? "Retry failed" }));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminCommandShell
      title="Live order refund escalations"
      subtitle="Buyer requests denied by the seller — support accepts (refund or return) or denies (final)."
    >
      {!loading && stuckRows.length > 0 ? (
        <div className="mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-amber-200">
            Stuck in refund processing ({stuckRows.length})
          </h2>
          {stuckRows.map((r) => (
            <article key={r.id} className={`${adminPanelClassName} border-amber-500/30 p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{r.listingTitle}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {r.kind === "cancel" ? "Cancel" : "Return"} · ${r.orderTotalUsd.toFixed(2)} · @
                    {r.buyerUsername} → @{r.sellerUsername}
                  </p>
                  <p className="mt-2 text-xs text-amber-200/90">
                    Stuck in refund processing for {formatStuckDuration(r.stuckForMs)}.
                  </p>
                </div>
              </div>
              {retryError[r.id] ? <p className="mt-2 text-xs text-rose-300">{retryError[r.id]}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => void retryStuck(r.id)}
                  className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50"
                >
                  Retry / recheck refund
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading queue…</p>
      ) : rows.length === 0 ? (
        <p className={`${adminPanelClassName} p-6 text-sm text-zinc-400`}>No escalated refund requests.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <article key={r.id} className={`${adminPanelClassName} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{r.listingTitle}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {r.kind === "cancel" ? "Cancel" : "Return"} · ${r.orderTotalUsd.toFixed(2)} · @
                    {r.buyerUsername} → @{r.sellerUsername}
                  </p>
                  <p className="mt-2 text-sm text-zinc-300">{r.reason}</p>
                  {r.sellerDenyReason ? (
                    <p className="mt-1 text-sm text-amber-200/90">Seller deny: {r.sellerDenyReason}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-500">{refundRequestStatusLabel(r.status)}</p>
                </div>
              </div>
              <textarea
                value={note[r.id] ?? ""}
                onChange={(e) => setNote((prev) => ({ ...prev, [r.id]: e.target.value }))}
                placeholder="Support note (optional)"
                rows={2}
                className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => void resolve(r.id, true)}
                  className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  Accept (refund / approve return)
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => void resolve(r.id, false)}
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/10 disabled:opacity-50"
                >
                  Deny (final)
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminCommandShell>
  );
}
