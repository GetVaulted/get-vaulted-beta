"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";
import { AdminMetricStrip } from "@/components/admin/AdminMetricStrip";
import type { SupportTicketDto } from "@/lib/support-tickets";
import { supportTicketCategoryLabel, supportTicketStatusLabel } from "@/lib/support-tickets";

const STATUS_FILTERS = ["", "submitted", "in_progress", "resolved", "closed"] as const;

export function AdminSupportTicketsPage() {
  const [rows, setRows] = useState<SupportTicketDto[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (statusFilter) sp.set("status", statusFilter);
      if (query.trim()) sp.set("q", query.trim());
      const res = await fetch(`/api/admin/support-tickets?${sp}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { tickets?: SupportTicketDto[]; openCount?: number };
      const tickets = Array.isArray(j.tickets) ? j.tickets : [];
      setRows(tickets);
      setOpenCount(typeof j.openCount === "number" ? j.openCount : 0);
      setNotes((prev) => {
        const next = { ...prev };
        for (const t of tickets) {
          if (next[t.id] === undefined) next[t.id] = t.adminNotes;
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(
    () => [
      { label: "Open tickets", value: openCount, tone: "warn" as const, href: "/admin/support-tickets?status=submitted" },
      { label: "Showing", value: rows.length, hint: statusFilter ? supportTicketStatusLabel(statusFilter) : "All statuses" },
    ],
    [openCount, rows.length, statusFilter],
  );

  async function saveTicket(id: string, status: SupportTicketDto["status"]) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/support-tickets/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNotes: notes[id] ?? "" }),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminCommandShell
      title="Support tickets"
      subtitle="In-app support requests from buyers and sellers — submitted from the mobile app."
      actions={
        <Link href="/admin/trust" className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold-bright hover:bg-gold/25">
          Trust & safety →
        </Link>
      }
    >
      <AdminMetricStrip metrics={metrics} />

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_FILTERS)[number])}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
          >
            <option value="">All</option>
            <option value="submitted">Submitted</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs text-zinc-500">
          Search
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Subject, message, username, email, reference…"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-gold/15 px-3 py-2 text-xs font-semibold text-gold-bright hover:bg-gold/25"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-zinc-500">Loading tickets…</p>
      ) : rows.length === 0 ? (
        <p className={`${adminPanelClassName} mt-8 p-6 text-sm text-zinc-400`}>
          No support tickets yet. New submissions from the mobile app will appear here after deploy and migration.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((t) => {
            const open = expandedId === t.id;
            return (
              <article key={t.id} className={`${adminPanelClassName} overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : t.id)}
                  className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{t.subject}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {supportTicketCategoryLabel(t.category)} · @{t.username ?? t.userId.slice(0, 8)} ·{" "}
                      {new Date(t.createdAt).toLocaleString()}
                    </p>
                    {t.referenceId ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        Ref: {t.referenceType ? `${t.referenceType} · ` : ""}
                        {t.referenceId}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gold-bright">
                    {t.statusLabel}
                  </span>
                </button>

                {open ? (
                  <div className="border-t border-white/5 px-4 pb-4 pt-3">
                    <p className="text-xs text-zinc-500">
                      #{t.id} · {t.contactEmail}
                      {t.assignedAdminUsername ? ` · Assigned @${t.assignedAdminUsername}` : ""}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{t.message}</p>

                    <textarea
                      value={notes[t.id] ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      placeholder="Internal admin notes"
                      rows={3}
                      className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["submitted", "in_progress", "resolved", "closed"] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={busyId === t.id}
                          onClick={() => void saveTicket(t.id, status)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                            t.status === status
                              ? "bg-gold/20 text-gold-bright"
                              : "bg-white/5 text-zinc-300 hover:bg-white/10"
                          }`}
                        >
                          {supportTicketStatusLabel(status)}
                        </button>
                      ))}
                      <Link
                        href={`/admin/users-management?q=${encodeURIComponent(t.username ?? t.userId)}`}
                        className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/10"
                      >
                        View user
                      </Link>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </AdminCommandShell>
  );
}
