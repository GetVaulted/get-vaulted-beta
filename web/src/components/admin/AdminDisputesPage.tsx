"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminButtonDangerClassName,
  adminButtonPrimaryClassName,
  adminPanelClassName,
} from "@/components/admin/AdminCommandShell";

type Dispute = {
  id: string;
  status: string;
  reason: string;
  amountCents: number;
  evidenceDueBy: string | null;
  hasEvidence: boolean;
  submissionCount: number;
  pastDue: boolean;
  openedAt: string;
  closedAt: string | null;
  adminNote: string;
  needsResponse: boolean;
  isOpen: boolean;
  order: {
    id: string;
    title: string;
    totalUsd: number;
    payoutStatus: string;
    buyer: { id: string; username: string };
    seller: { id: string; username: string };
  } | null;
};

type Evidence = {
  customerName?: string;
  customerEmail?: string;
  productDescription?: string;
  shippingCarrier?: string;
  shippingTrackingNumber?: string;
  shippingAddress?: string;
  shippingDate?: string;
  uncategorizedText?: string;
};

const FIELDS: Array<{ key: keyof Evidence; label: string; long?: boolean }> = [
  { key: "customerName", label: "Customer name" },
  { key: "customerEmail", label: "Customer email" },
  { key: "productDescription", label: "What was sold" },
  { key: "shippingCarrier", label: "Carrier" },
  { key: "shippingTrackingNumber", label: "Tracking number" },
  { key: "shippingAddress", label: "Shipping address" },
  { key: "shippingDate", label: "Ship date (YYYY-MM-DD)" },
  { key: "uncategorizedText", label: "Your explanation to the bank", long: true },
];

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function dueLabel(iso: string | null): { text: string; tone: "ok" | "warn" | "bad" | "neutral" } {
  if (!iso) return { text: "No due date", tone: "neutral" };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return { text: "Past due", tone: "bad" };
  const h = Math.floor(ms / 3600000);
  if (h < 48) return { text: `Due in ${h}h`, tone: "bad" };
  const d = Math.floor(h / 24);
  return { text: `Due in ${d}d`, tone: d < 5 ? "warn" : "ok" };
}

export function AdminDisputesPage() {
  const [rows, setRows] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence>({});
  const [reason, setReason] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/disputes", { cache: "no-store" });
      if (res.ok) setRows(((await res.json()) as { disputes: Dispute[] }).disputes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => rows.filter((r) => (tab === "open" ? r.isOpen : !r.isOpen)), [rows, tab]);
  const urgent = rows.filter((r) => r.needsResponse).length;

  async function sync() {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/disputes/sync", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { synced?: number; error?: string };
      setMsg(res.ok ? { ok: true, text: `Synced ${j.synced ?? 0} disputes from Stripe.` } : { ok: false, text: `Sync failed: ${j.error ?? res.status}` });
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function openForm(id: string) {
    setOpenId(id);
    setConfirmSubmit(false);
    setReason("");
    setMsg(null);
    const res = await fetch(`/api/admin/disputes/${encodeURIComponent(id)}`, { cache: "no-store" });
    setEvidence(res.ok ? ((await res.json()) as { evidence: Evidence }).evidence : {});
  }

  async function send(id: string, action: "save_draft" | "submit") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/disputes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, evidence }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMsg({ ok: true, text: action === "submit" ? "Evidence submitted to the bank." : "Draft saved with Stripe." });
        setConfirmSubmit(false);
        if (action === "submit") setOpenId(null);
        await load();
      } else {
        setMsg({
          ok: false,
          text:
            j.error === "REASON_REQUIRED"
              ? "Write a reason first (at least 5 characters)."
              : j.error === "NOT_ACCEPTING_EVIDENCE"
                ? "Stripe is no longer accepting evidence on this dispute."
                : j.error === "EMPTY_EVIDENCE"
                  ? "Fill in at least one field."
                  : `Failed: ${j.error ?? res.status}`,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCommandShell
      title="Disputes & chargebacks"
      subtitle="Card disputes from Stripe, soonest deadline first. Payouts on disputed orders are already frozen automatically. Missing a deadline loses the dispute."
      actions={
        <button type="button" onClick={() => void sync()} disabled={syncing} className={adminButtonPrimaryClassName}>
          {syncing ? "Syncing…" : "Sync from Stripe"}
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "closed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === t ? "bg-gold/15 text-gold-bright" : "text-zinc-400 hover:bg-white/[0.04]"}`}
          >
            {t === "open" ? `Open (${rows.filter((r) => r.isOpen).length})` : `Closed (${rows.filter((r) => !r.isOpen).length})`}
          </button>
        ))}
        {urgent > 0 ? <AdminStatusPill tone="bad">{urgent} need a response</AdminStatusPill> : null}
      </div>

      {msg ? <p className={`mt-3 text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p> : null}

      <div className="mt-5 space-y-4">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className={`${adminPanelClassName} p-6 text-sm text-zinc-400`}>
            {tab === "open" ? "No open disputes. If you expect some, press Sync from Stripe." : "No closed disputes yet."}
          </p>
        ) : (
          visible.map((d) => {
            const due = dueLabel(d.evidenceDueBy);
            return (
              <article key={d.id} className={`${adminPanelClassName} p-5 text-xs`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {usd(d.amountCents)} · {d.reason.replace(/_/g, " ") || "dispute"}
                    </p>
                    <p className="mt-1 text-zinc-500">
                      {d.order ? (
                        <>
                          <Link href={`/admin/orders/${d.order.id}`} className="text-gold-bright hover:underline">
                            {d.order.title}
                          </Link>{" "}
                          · @{d.order.buyer.username} → @{d.order.seller.username} · payout {d.order.payoutStatus}
                        </>
                      ) : (
                        "Order not matched yet"
                      )}
                    </p>
                    <p className="mt-1 text-zinc-600">
                      Opened {new Date(d.openedAt).toLocaleDateString()} · {d.id}
                      {d.submissionCount > 0 ? ` · submitted ${d.submissionCount}x` : d.hasEvidence ? " · draft saved" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {d.needsResponse ? <AdminStatusPill tone={due.tone}>{due.text}</AdminStatusPill> : null}
                    <AdminStatusPill tone={d.status === "won" ? "ok" : d.status === "lost" ? "bad" : "warn"}>
                      {d.status.replace(/_/g, " ")}
                    </AdminStatusPill>
                  </div>
                </div>

                {d.needsResponse ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void openForm(d.id)} className={adminButtonPrimaryClassName}>
                      {openId === d.id ? "Reload from order" : "Prepare evidence"}
                    </button>
                    <a
                      href={`https://dashboard.stripe.com/disputes/${encodeURIComponent(d.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200"
                    >
                      Open in Stripe
                    </a>
                  </div>
                ) : null}

                {openId === d.id ? (
                  <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
                    <p className="text-zinc-500">Pre-filled from the order. Edit anything that is wrong or missing.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {FIELDS.map((f) => (
                        <label key={f.key} className={`flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500 ${f.long ? "sm:col-span-2" : ""}`}>
                          {f.label}
                          {f.long ? (
                            <textarea
                              rows={4}
                              value={evidence[f.key] ?? ""}
                              onChange={(e) => setEvidence((p) => ({ ...p, [f.key]: e.target.value }))}
                              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground"
                            />
                          ) : (
                            <input
                              value={evidence[f.key] ?? ""}
                              onChange={(e) => setEvidence((p) => ({ ...p, [f.key]: e.target.value }))}
                              className="rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-xs font-normal normal-case tracking-normal text-zinc-200"
                            />
                          )}
                        </label>
                      ))}
                    </div>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      aria-label="Reason"
                      rows={2}
                      placeholder="Reason (required, saved to the activity log)"
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                    />
                    {confirmSubmit ? (
                      <div className="rounded-lg border border-rose-400/30 bg-rose-950/20 p-3 text-rose-100">
                        <p>Submitting is final. The bank gets this evidence and you cannot add more. Submit now?</p>
                        <div className="mt-2 flex gap-2">
                          <button type="button" disabled={busy} onClick={() => void send(d.id, "submit")} className={adminButtonDangerClassName}>
                            {busy ? "Submitting…" : "Yes, submit final"}
                          </button>
                          <button type="button" disabled={busy} onClick={() => setConfirmSubmit(false)} className="px-3 text-zinc-400">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy || reason.trim().length < 5}
                          onClick={() => void send(d.id, "save_draft")}
                          className={adminButtonPrimaryClassName}
                        >
                          Save draft
                        </button>
                        <button
                          type="button"
                          disabled={busy || reason.trim().length < 5}
                          onClick={() => setConfirmSubmit(true)}
                          className={adminButtonDangerClassName}
                        >
                          Submit to bank…
                        </button>
                      </div>
                    )}
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
