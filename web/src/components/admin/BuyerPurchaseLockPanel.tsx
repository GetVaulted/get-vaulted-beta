"use client";

import { useCallback, useEffect, useState } from "react";

type LockState = {
  locked: boolean;
  lockedAt: string | null;
  reason: string | null;
  automatic: boolean;
};

/**
 * Admin control for the buyer purchase lock (src/lib/buyer-payment-risk.ts): blocks bidding, buying and
 * checkout. Applied automatically after repeated failed payments, or by an admin. Login is unaffected.
 */
export function BuyerPurchaseLockPanel({ userId }: { userId: string }) {
  const [state, setState] = useState<LockState | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/purchase-lock`, { cache: "no-store" });
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
        ? "Lock buying for this account? They will not be able to bid, buy or check out until you lift it."
        : "Lift the purchase lock? The account can bid and buy again.";
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/purchase-lock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ tone: "error", text: json.error ?? "Could not update the lock." });
        return;
      }
      setReason("");
      setMessage({ tone: "ok", text: action === "lock" ? "Buying locked." : "Purchase lock lifted." });
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
      id="buyer-purchase-lock"
      className={`mt-4 rounded-xl border p-4 text-xs ${
        state.locked ? "border-rose-500/50 bg-rose-500/[0.07]" : "border-white/[0.08] bg-[#0a0a0d]/80"
      }`}
    >
      <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Buyer purchase lock</h2>
      {state.locked ? (
        <div className="mt-2">
          <p className="text-sm font-bold text-rose-300">LOCKED — cannot bid, buy or check out</p>
          <p className="mt-1 text-zinc-400">
            Since {state.lockedAt ? new Date(state.lockedAt).toLocaleString() : "—"}
            {state.automatic ? " (automatic: repeated failed payments)" : ""}
          </p>
          {state.reason && !state.automatic ? <p className="mt-1 text-zinc-300">Reason: {state.reason}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-zinc-400">
          Not locked. Locking stops this account bidding, buying and checking out. Accounts are also locked
          automatically after 5 failed payments in 24 hours. They can still log in and message.
        </p>
      )}
      <label htmlFor="buyer-purchase-lock-reason-input" className="mt-3 block text-[10px] font-semibold text-zinc-500">
        Reason (saved to the audit log)
      </label>
      <input
        id="buyer-purchase-lock-reason-input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={1000}
        placeholder={state.locked ? "Why is the lock being lifted?" : "Why is buying being locked?"}
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
            Lock buying
          </button>
        )}
      </div>
      {message ? (
        <p className={`mt-2 ${message.tone === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{message.text}</p>
      ) : null}
    </section>
  );
}
