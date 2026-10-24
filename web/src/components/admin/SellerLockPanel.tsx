"use client";

import { useCallback, useEffect, useState } from "react";

type LockState = {
  locked: boolean;
  lockedAt: string | null;
  reason: string | null;
  lockedByUsername: string | null;
};

/**
 * Admin control for the targeted seller lock: blocks going live and every payout until lifted.
 * Login, shipping and messaging are unaffected (use Suspend for a full account block).
 */
export function SellerLockPanel({ userId }: { userId: string }) {
  const [state, setState] = useState<LockState | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/seller-lock`, { cache: "no-store" });
      if (!res.ok) return;
      setState((await res.json()) as LockState);
    } catch {
      /* panel stays hidden-state until the next load */
    }
  }, [userId]);

  useEffect(() => {
    if (userId) void load();
  }, [userId, load]);

  const submit = async (action: "lock" | "unlock") => {
    if (busy) return;
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setMessage({ tone: "error", text: "Write a reason (at least 5 characters)." });
      return;
    }
    const confirmText =
      action === "lock"
        ? "Lock this seller? They will be unable to go live and all payouts to them stop until you lift the lock. Any show they are running now will be ended."
        : "Lift the lock? The seller can go live again and payouts resume.";
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/seller-lock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        liveShowsEnded?: number;
        stripePayoutScheduleManual?: boolean | null;
      };
      if (!res.ok) {
        setMessage({ tone: "error", text: json.error ?? "Could not update the lock." });
        return;
      }
      setReason("");
      if (action === "lock") {
        const ended = json.liveShowsEnded ?? 0;
        const sched =
          json.stripePayoutScheduleManual === false
            ? " Could not confirm the Stripe payout schedule is manual — check the Stripe account."
            : "";
        setMessage({ tone: "ok", text: `Seller locked.${ended > 0 ? ` ${ended} live show(s) ended.` : ""}${sched}` });
      } else {
        setMessage({ tone: "ok", text: "Lock lifted." });
      }
      await load();
    } catch {
      setMessage({ tone: "error", text: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;

  return (
    <section
      id="seller-lock-reason"
      className={`mt-4 rounded-xl border p-4 text-xs ${
        state.locked ? "border-rose-500/50 bg-rose-500/[0.07]" : "border-white/[0.08] bg-[#0a0a0d]/80"
      }`}
    >
      <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Seller lock</h2>
      {state.locked ? (
        <div className="mt-2">
          <p className="text-sm font-bold text-rose-300">LOCKED — cannot go live, no payouts</p>
          <p className="mt-1 text-zinc-400">
            Since {state.lockedAt ? new Date(state.lockedAt).toLocaleString() : "—"}
            {state.lockedByUsername ? ` by @${state.lockedByUsername}` : ""}
          </p>
          {state.reason ? <p className="mt-1 text-zinc-300">Reason: {state.reason}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-zinc-400">
          Not locked. Locking stops this seller going live and stops every payout (Stripe, PayPal, their own Get paid
          button, automatic release) until you lift it. They can still log in, ship and message.
        </p>
      )}
      <label htmlFor="seller-lock-reason-input" className="mt-3 block text-[10px] font-semibold text-zinc-500">
        Reason (saved to the audit log)
      </label>
      <input
        id="seller-lock-reason-input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={1000}
        placeholder={state.locked ? "Why is the lock being lifted?" : "Why is the seller being locked?"}
        className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-gold/50"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {state.locked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit("unlock")}
            className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-[10px] font-semibold text-emerald-200 disabled:opacity-50"
          >
            Lift lock
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit("lock")}
            className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[10px] font-semibold text-rose-200 disabled:opacity-50"
          >
            Lock seller (no live, no payouts)
          </button>
        )}
      </div>
      {message ? (
        <p className={`mt-2 ${message.tone === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{message.text}</p>
      ) : null}
    </section>
  );
}
