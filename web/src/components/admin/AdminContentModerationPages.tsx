"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminButtonDangerClassName,
  adminButtonPrimaryClassName,
  adminPanelClassName,
} from "@/components/admin/AdminCommandShell";

const MSG: Record<string, string> = {
  REASON_REQUIRED: "Write a reason first (at least 5 characters).",
  ALREADY_HIDDEN: "Already hidden.",
  NOT_HIDDEN: "Not hidden.",
  ALREADY_DELETED: "Already deleted.",
  NOT_DELETED: "Not deleted.",
  NOT_FOUND: "Not found.",
};

function useAction(onDone: () => Promise<void>) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(url: string, action: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setOpenId(null);
        setReason("");
        await onDone();
      } else {
        setErr(MSG[j.error ?? ""] ?? `Failed: ${j.error ?? res.status}`);
      }
    } finally {
      setBusy(false);
    }
  }
  return { openId, setOpenId, reason, setReason, busy, err, setErr, run };
}

function ReasonBox({
  reason,
  setReason,
  busy,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
  err,
}: {
  reason: string;
  setReason: (v: string) => void;
  busy: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  err: string | null;
}) {
  return (
    <div className="mt-3 rounded-lg border border-gold/30 bg-gold/[0.06] p-3">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Reason"
        placeholder="Reason (required, saved to the activity log)"
        rows={2}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy || reason.trim().length < 5}
          onClick={onConfirm}
          className={danger ? adminButtonDangerClassName : adminButtonPrimaryClassName}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="px-3 text-xs text-zinc-400 hover:text-zinc-200">
          Cancel
        </button>
      </div>
      {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}
    </div>
  );
}

type Review = {
  id: string;
  orderId: string;
  rating: number;
  body: string;
  tags: string[];
  hidden: boolean;
  createdAt: string;
  seller: { id: string; username: string };
  buyer: { id: string; username: string };
};

export function AdminReviewsPage() {
  const [q, setQ] = useState("");
  const [state, setState] = useState<"all" | "visible" | "hidden">("all");
  const [low, setLow] = useState(false);
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ state });
    if (q.trim()) sp.set("q", q.trim());
    if (low) sp.set("maxRating", "2");
    const res = await fetch(`/api/admin/reviews?${sp.toString()}`, { cache: "no-store" });
    if (res.ok) setRows(((await res.json()) as { reviews: Review[] }).reviews);
    setLoading(false);
  }, [q, state, low]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const a = useAction(load);

  return (
    <AdminCommandShell
      title="Reviews"
      subtitle="Hide a review to take it off the seller's public profile (it stays in the database and can be restored). Every hide and restore is logged with a reason."
    >
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search reviews"
          placeholder="Search text, @buyer, @seller, order id"
          className="w-full max-w-xs rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-zinc-200 placeholder:text-zinc-600"
        />
        <select
          value={state}
          onChange={(e) => setState(e.target.value as typeof state)}
          aria-label="Visibility"
          className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-zinc-200"
        >
          <option value="all">All</option>
          <option value="visible">Visible</option>
          <option value="hidden">Hidden</option>
        </select>
        <label className="flex items-center gap-2 text-zinc-300">
          <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} />
          1–2 stars only
        </label>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className={`${adminPanelClassName} p-4 text-xs text-zinc-400`}>No reviews match.</p>
        ) : (
          rows.map((r) => (
            <article key={r.id} className={`${adminPanelClassName} p-4 text-xs`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-zinc-300">
                  <span className="font-bold text-gold-bright">{"★".repeat(r.rating)}</span>
                  <span className="text-zinc-600">{"★".repeat(5 - r.rating)}</span>{" "}
                  <Link href={`/admin/users/${r.buyer.id}`} className="hover:text-gold-bright">
                    @{r.buyer.username}
                  </Link>{" "}
                  about{" "}
                  <Link href={`/admin/users/${r.seller.id}`} className="hover:text-gold-bright">
                    @{r.seller.username}
                  </Link>{" "}
                  · {new Date(r.createdAt).toLocaleDateString()} ·{" "}
                  <Link href={`/admin/orders/${r.orderId}`} className="text-gold-bright hover:underline">
                    order
                  </Link>
                </p>
                {r.hidden ? <AdminStatusPill tone="warn">hidden</AdminStatusPill> : <AdminStatusPill tone="ok">visible</AdminStatusPill>}
              </div>
              {r.body ? <p className="mt-2 text-sm text-zinc-200">{r.body}</p> : null}
              {r.tags.length > 0 ? <p className="mt-1 text-zinc-500">{r.tags.join(" · ")}</p> : null}
              {a.openId === r.id ? (
                <ReasonBox
                  reason={a.reason}
                  setReason={a.setReason}
                  busy={a.busy}
                  err={a.err}
                  danger={!r.hidden}
                  confirmLabel={r.hidden ? "Restore review" : "Hide review"}
                  onConfirm={() => void a.run(`/api/admin/reviews/${encodeURIComponent(r.id)}`, r.hidden ? "restore" : "hide")}
                  onCancel={() => a.setOpenId(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    a.setErr(null);
                    a.setOpenId(r.id);
                  }}
                  className={`mt-3 ${r.hidden ? adminButtonPrimaryClassName : adminButtonDangerClassName}`}
                >
                  {r.hidden ? "Restore" : "Hide from profile"}
                </button>
              )}
            </article>
          ))
        )}
      </div>
    </AdminCommandShell>
  );
}

type Msg = {
  id: string;
  body: string;
  type: string;
  deleted: boolean;
  createdAt: string;
  sender: { id: string; username: string };
  show: { id: string; title: string };
};

export function AdminChatMessagesPage() {
  const [mode, setMode] = useState<"user" | "show" | "q">("user");
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<Msg[] | null>(null);

  const search = useCallback(async () => {
    const t = term.trim();
    if (!t) return;
    const res = await fetch(`/api/admin/chat-messages?${mode}=${encodeURIComponent(t)}`, { cache: "no-store" });
    if (res.ok) setRows(((await res.json()) as { messages: Msg[] }).messages);
  }, [mode, term]);

  const a = useAction(search);

  return (
    <AdminCommandShell
      title="Chat messages"
      subtitle="Find live chat by user, show, or words, then delete or restore a message. Deleted messages stay stored for evidence. Viewers already in a show may see it until they refresh."
    >
      <form
        className="flex flex-wrap items-center gap-2 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          aria-label="Search by"
          className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-zinc-200"
        >
          <option value="user">Sender @username</option>
          <option value="show">Show id</option>
          <option value="q">Words in message</option>
        </select>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Search term"
          className="w-full max-w-xs rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-zinc-200"
        />
        <button type="submit" className={adminButtonPrimaryClassName}>
          Find messages
        </button>
      </form>

      {rows ? (
        <div className="mt-5 space-y-2">
          {rows.length === 0 ? (
            <p className={`${adminPanelClassName} p-4 text-xs text-zinc-400`}>No messages found.</p>
          ) : (
            rows.map((m) => (
              <article key={m.id} className={`${adminPanelClassName} p-3 text-xs`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-zinc-500">
                    <Link href={`/admin/users/${m.sender.id}`} className="text-zinc-300 hover:text-gold-bright">
                      @{m.sender.username}
                    </Link>{" "}
                    in {m.show.title} · {new Date(m.createdAt).toLocaleString()}
                  </p>
                  {m.deleted ? <AdminStatusPill tone="warn">deleted</AdminStatusPill> : null}
                </div>
                <p className={`mt-1 text-sm ${m.deleted ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{m.body}</p>
                {a.openId === m.id ? (
                  <ReasonBox
                    reason={a.reason}
                    setReason={a.setReason}
                    busy={a.busy}
                    err={a.err}
                    danger={!m.deleted}
                    confirmLabel={m.deleted ? "Restore message" : "Delete message"}
                    onConfirm={() =>
                      void a.run(`/api/admin/chat-messages/${encodeURIComponent(m.id)}`, m.deleted ? "restore" : "delete")
                    }
                    onCancel={() => a.setOpenId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      a.setErr(null);
                      a.setOpenId(m.id);
                    }}
                    className={`mt-2 ${m.deleted ? adminButtonPrimaryClassName : adminButtonDangerClassName}`}
                  >
                    {m.deleted ? "Restore" : "Delete"}
                  </button>
                )}
              </article>
            ))
          )}
        </div>
      ) : null}
    </AdminCommandShell>
  );
}
