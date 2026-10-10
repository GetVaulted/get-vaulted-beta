"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminButtonDangerClassName,
  adminButtonPrimaryClassName,
  adminPanelClassName,
} from "@/components/admin/AdminCommandShell";
import { AdminCsvExportButton } from "@/components/admin/AdminCsvExportButton";
import { refundRequestStatusLabel } from "@/lib/order-refund-eligibility";
import type { OrderRefundRequestDto } from "@/lib/order-refund-types";

type Action = "approve" | "deny" | "force_refund" | "retry";

type QueueRow = OrderRefundRequestDto & {
  orderTotalUsd: number;
  orderPaymentStatus: string;
  orderFulfillmentStatus: string;
  listingTitle: string;
  buyerId: string;
  sellerId: string;
  buyerUsername: string;
  sellerUsername: string;
  isOpen: boolean;
  stuckForMs: number | null;
  allowedActions: Action[];
};

type Tab = "needs_action" | "in_progress" | "closed";

const MIN_REASON = 5;
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function tabFor(r: QueueRow): Tab {
  if (!r.isOpen) return "closed";
  if (r.status === "escalated" || r.status === "refund_processing") return "needs_action";
  return "in_progress";
}

function tone(status: string): "ok" | "warn" | "bad" | "neutral" {
  if (status === "refunded") return "ok";
  if (status === "escalated" || status === "refund_processing") return "bad";
  if (status === "support_denied" || status === "seller_denied") return "neutral";
  return "warn";
}

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "under an hour ago";
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function actionCopy(a: Action, r: QueueRow): { label: string; confirm: string; className: string } {
  const amount = usd(r.orderTotalUsd);
  switch (a) {
    case "approve":
      return {
        label: r.kind === "cancel" ? "Approve & refund" : "Approve (return or refund)",
        confirm:
          r.kind === "cancel"
            ? `Refund ${amount} to @${r.buyerUsername} now. Real money moves through Stripe.`
            : `Approve the return for @${r.buyerUsername}. The buyer ships the item back; the refund goes out after.`,
        className: adminButtonPrimaryClassName,
      };
    case "deny":
      return {
        label: "Deny (final)",
        confirm: `Close this request with no refund. @${r.buyerUsername} and @${r.sellerUsername} are notified. This cannot be reopened.`,
        className: "rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/10 disabled:opacity-50",
      };
    case "force_refund":
      return {
        label: "Refund now (override)",
        confirm: `Skip the normal steps and refund ${amount} to @${r.buyerUsername} immediately. Real money moves through Stripe.`,
        className: adminButtonDangerClassName,
      };
    case "retry":
      return {
        label: "Retry / recheck refund",
        confirm: "Re-run the refund check. Safe to repeat: Stripe will not double-refund.",
        className: "rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50",
      };
  }
}

function RefundQueue() {
  const focus = useSearchParams()?.get("focus") ?? null;
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("needs_action");
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ id: string; action: Action } | null>(null);
  const [message, setMessage] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/refund-requests", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { queue?: QueueRow[] };
      setRows(Array.isArray(j.queue) ? j.queue : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep link from search / profile: jump to the tab holding that request.
  useEffect(() => {
    if (!focus) return;
    const hit = rows.find((r) => r.id === focus);
    if (hit) setTab(tabFor(hit));
  }, [focus, rows]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { needs_action: 0, in_progress: 0, closed: 0 };
    for (const r of rows) c[tabFor(r)] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase().replace(/^@/, "");
    return rows
      .filter((r) => tabFor(r) === tab)
      .filter(
        (r) =>
          !q ||
          r.buyerUsername.toLowerCase().includes(q) ||
          r.sellerUsername.toLowerCase().includes(q) ||
          r.listingTitle.toLowerCase().includes(q) ||
          r.orderId.toLowerCase().startsWith(q) ||
          r.id.toLowerCase().startsWith(q),
      );
  }, [rows, tab, filter]);

  async function run(r: QueueRow, action: Action) {
    const text = (reason[r.id] ?? "").trim();
    if (action !== "retry" && text.length < MIN_REASON) {
      setMessage({ id: r.id, ok: false, text: "Write a reason first (at least 5 characters)." });
      return;
    }
    setBusyId(r.id);
    setMessage(null);
    try {
      const res =
        action === "retry"
          ? await fetch(`/api/admin/refund-requests/${encodeURIComponent(r.id)}/retry`, { method: "POST" })
          : await fetch(`/api/admin/refund-requests/${encodeURIComponent(r.id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                action === "force_refund"
                  ? { action: "force_refund", note: text }
                  : { approve: action === "approve", note: text },
              ),
            });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMessage({ id: r.id, ok: true, text: "Done." });
        setPending(null);
        setReason((p) => ({ ...p, [r.id]: "" }));
        await load();
      } else {
        setMessage({ id: r.id, ok: false, text: j.error ? `Failed: ${j.error}` : "Failed." });
      }
    } finally {
      setBusyId(null);
    }
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "needs_action", label: "Needs action" },
    { key: "in_progress", label: "In progress" },
    { key: "closed", label: "Closed (30 days)" },
  ];

  return (
    <AdminCommandShell
      title="Refunds & cancels"
      subtitle="Every refund, cancel and return request in one place. Pick an action, write why, confirm. Money only moves when you confirm; every action is logged."
      actions={<AdminCsvExportButton report="refund-requests" />}
    >
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.key ? "bg-gold/15 text-gold-bright" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
            }`}
          >
            {t.label} <span className="text-zinc-500">({counts[t.key]})</span>
          </button>
        ))}
        <label htmlFor="refund-filter" className="sr-only">
          Filter requests
        </label>
        <input
          id="refund-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by @user, item, order id"
          className="ml-auto w-full max-w-xs rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600"
        />
      </div>

      <div className="mt-5 space-y-4">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className={`${adminPanelClassName} p-6 text-sm text-zinc-400`}>Nothing here.</p>
        ) : (
          visible.map((r) => {
            const isPending = pending?.id === r.id ? pending.action : null;
            const msg = message?.id === r.id ? message : null;
            return (
              <article
                key={r.id}
                id={`req-${r.id}`}
                className={`${adminPanelClassName} p-5 ${focus === r.id ? "ring-1 ring-gold/50" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{r.listingTitle}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {r.kind === "cancel" ? "Cancel" : "Return"} · {usd(r.orderTotalUsd)} ·{" "}
                      <Link href={`/admin/users/${r.buyerId}`} className="hover:text-gold-bright">
                        @{r.buyerUsername}
                      </Link>{" "}
                      →{" "}
                      <Link href={`/admin/users/${r.sellerId}`} className="hover:text-gold-bright">
                        @{r.sellerUsername}
                      </Link>{" "}
                      · opened {ageLabel(r.createdAt)} ·{" "}
                      <Link href={`/admin/orders/${r.orderId}`} className="text-gold-bright hover:underline">
                        order
                      </Link>
                    </p>
                  </div>
                  <AdminStatusPill tone={tone(r.status)}>{refundRequestStatusLabel(r.status)}</AdminStatusPill>
                </div>

                <p className="mt-3 text-sm text-zinc-300">{r.reason}</p>
                {r.sellerDenyReason ? (
                  <p className="mt-1 text-sm text-amber-200/90">Seller said: {r.sellerDenyReason}</p>
                ) : null}
                {r.supportNote ? <p className="mt-1 text-xs text-zinc-500">Support note: {r.supportNote}</p> : null}
                {r.photoUrls.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.photoUrls.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer" className="text-xs text-gold-bright hover:underline">
                        photo
                      </a>
                    ))}
                  </div>
                ) : null}
                {r.returnTrackingNumber ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Return tracking: {r.returnCarrier ?? ""} {r.returnTrackingNumber}
                  </p>
                ) : null}
                {r.stuckForMs != null && r.stuckForMs > 3 * 60 * 1000 ? (
                  <p className="mt-2 text-xs text-amber-200/90">
                    Stuck in refund processing for {Math.floor(r.stuckForMs / 60000)} min.
                  </p>
                ) : null}

                {r.allowedActions.length > 0 ? (
                  <div className="mt-4 border-t border-white/[0.06] pt-4">
                    {r.allowedActions.some((a) => a !== "retry") ? (
                      <textarea
                        value={reason[r.id] ?? ""}
                        onChange={(e) => setReason((p) => ({ ...p, [r.id]: e.target.value }))}
                        placeholder="Reason (required, saved to the activity log)"
                        aria-label="Reason"
                        rows={2}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                      />
                    ) : null}
                    {isPending ? (
                      <div className="mt-3 rounded-lg border border-gold/30 bg-gold/[0.06] p-3 text-xs text-zinc-200">
                        <p>{actionCopy(isPending, r).confirm}</p>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void run(r, isPending)}
                            className={actionCopy(isPending, r).className}
                          >
                            {busyId === r.id ? "Working…" : "Yes, confirm"}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => setPending(null)}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.allowedActions.map((a) => (
                          <button
                            key={a}
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => {
                              setMessage(null);
                              if (a !== "retry" && (reason[r.id] ?? "").trim().length < MIN_REASON) {
                                setMessage({ id: r.id, ok: false, text: "Write a reason first (at least 5 characters)." });
                                return;
                              }
                              setPending({ id: r.id, action: a });
                            }}
                            className={actionCopy(a, r).className}
                          >
                            {actionCopy(a, r).label}
                          </button>
                        ))}
                      </div>
                    )}
                    {msg ? (
                      <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </AdminCommandShell>
  );
}

export function AdminRefundRequestsPage() {
  return (
    <Suspense fallback={null}>
      <RefundQueue />
    </Suspense>
  );
}
