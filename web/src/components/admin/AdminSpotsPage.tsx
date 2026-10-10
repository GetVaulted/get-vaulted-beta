"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminButtonDangerClassName,
  adminButtonPrimaryClassName,
  adminPanelClassName,
} from "@/components/admin/AdminCommandShell";

type Spot = {
  id: string;
  buyer: string;
  show: string;
  showId: string;
  item: string;
  label: string;
  status: string;
  totalUsd: number;
  channel: string;
  cardPaid: boolean;
  hasOrder: boolean;
  createdAt: string;
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const ERRORS: Record<string, string> = {
  REASON_REQUIRED: "Write a reason first (at least 5 characters).",
  ORDER_EXISTS: "This spot already has an order. Fix it from the order or the Refunds queue.",
  CARD_PAID_USE_REFUND: "This spot was paid by card. Refund it from the Refunds queue instead of releasing it.",
  PAID_ON_PLATFORM_NEEDS_ACK: "This spot was paid by card from the current buyer. Tick the box to confirm you want to move it anyway.",
  USER_NOT_FOUND: "No user with that @username.",
  USER_SUSPENDED: "That user is suspended.",
  SAME_BUYER: "That is already the buyer.",
  SPOT_NOT_ACTIVE: "This spot is already cancelled.",
  ALREADY_RELEASED: "This spot is already released.",
};

export function AdminSpotsPage() {
  const [mode, setMode] = useState<"buyer" | "show">("buyer");
  const [q, setQ] = useState("");
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [open, setOpen] = useState<{ id: string; action: "reassign" | "release" } | null>(null);
  const [toUser, setToUser] = useState("");
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const search = useCallback(async () => {
    const term = q.trim();
    if (!term) return;
    setMsg(null);
    const res = await fetch(`/api/admin/spots?${mode}=${encodeURIComponent(term)}`, { cache: "no-store" });
    if (res.ok) setSpots(((await res.json()) as { spots: Spot[] }).spots);
  }, [mode, q]);

  async function submit() {
    if (!open) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/spots/${encodeURIComponent(open.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: open.action, reason, toUsername: toUser, acknowledgePaidOnPlatform: ack }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMsg({ ok: true, text: open.action === "reassign" ? "Spot reassigned." : "Spot released." });
        setOpen(null);
        setReason("");
        setToUser("");
        setAck(false);
        await search();
      } else {
        setMsg({ ok: false, text: ERRORS[j.error ?? ""] ?? `Failed: ${j.error ?? res.status}` });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCommandShell
      title="Fix spots"
      subtitle="Look up a buyer's spots (or a whole show) and fix them: move a spot to the right buyer, or free a spot that shouldn't be sold. Spots with an order or a card payment are protected."
    >
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "buyer" | "show")}
          aria-label="Search by"
          className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
        >
          <option value="buyer">Buyer @username</option>
          <option value="show">Show id</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search term"
          placeholder={mode === "buyer" ? "@username" : "show id"}
          className="w-full max-w-xs rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600"
        />
        <button type="submit" className={adminButtonPrimaryClassName}>
          Find spots
        </button>
      </form>

      {msg ? <p className={`mt-3 text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p> : null}

      {spots ? (
        <div className="mt-5 space-y-3">
          {spots.length === 0 ? (
            <p className={`${adminPanelClassName} p-4 text-xs text-zinc-400`}>No spots found.</p>
          ) : (
            spots.map((s) => {
              const inactive = s.status === "cancelled" || s.status === "failed";
              const isOpen = open?.id === s.id;
              return (
                <article key={s.id} className={`${adminPanelClassName} p-4 text-xs`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-100">
                        {s.label} <span className="font-normal text-zinc-500">· {s.item}</span>
                      </p>
                      <p className="text-zinc-500">
                        @{s.buyer} · {s.show} · {usd(s.totalUsd)} · {s.channel} · {new Date(s.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.hasOrder ? <AdminStatusPill tone="neutral">has order</AdminStatusPill> : null}
                      <AdminStatusPill tone={s.status === "paid" ? "ok" : inactive ? "neutral" : "warn"}>{s.status}</AdminStatusPill>
                    </div>
                  </div>

                  {!inactive && !s.hasOrder ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setOpen({ id: s.id, action: "reassign" })} className={adminButtonPrimaryClassName}>
                        Move to another buyer
                      </button>
                      {!s.cardPaid ? (
                        <button type="button" onClick={() => setOpen({ id: s.id, action: "release" })} className={adminButtonDangerClassName}>
                          Free this spot
                        </button>
                      ) : null}
                    </div>
                  ) : s.hasOrder ? (
                    <p className="mt-3 text-zinc-500">
                      This spot has an order, so it can&apos;t be edited here. Use the order page or{" "}
                      <Link href="/admin/refund-requests" className="text-gold-bright hover:underline">
                        Refunds
                      </Link>
                      .
                    </p>
                  ) : null}

                  {isOpen ? (
                    <div className="mt-3 rounded-lg border border-gold/30 bg-gold/[0.06] p-3">
                      {open.action === "reassign" ? (
                        <>
                          <input
                            value={toUser}
                            onChange={(e) => setToUser(e.target.value)}
                            aria-label="New buyer @username"
                            placeholder="New buyer @username"
                            className="w-full max-w-xs rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-xs text-zinc-200"
                          />
                          {s.cardPaid ? (
                            <label className="mt-2 flex items-center gap-2 text-zinc-300">
                              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                              This was paid by card from @{s.buyer}. Move it anyway.
                            </label>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-zinc-200">
                          Free this spot so it can be sold again. @{s.buyer} loses it. No money moves.
                        </p>
                      )}
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        aria-label="Reason"
                        placeholder="Reason (required, saved to the activity log)"
                        rows={2}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={busy || reason.trim().length < 5 || (open.action === "reassign" && !toUser.trim())}
                          onClick={() => void submit()}
                          className={adminButtonPrimaryClassName}
                        >
                          {busy ? "Working…" : "Confirm"}
                        </button>
                        <button type="button" disabled={busy} onClick={() => setOpen(null)} className="px-3 text-zinc-400 hover:text-zinc-200">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      ) : null}
    </AdminCommandShell>
  );
}
