"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AllowedAction = "accept" | "decline" | "cancel" | "counter";

export function TradeActionBar({
  offerId,
  allowedActions,
}: {
  offerId: string;
  allowedActions: AllowedAction[];
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<AllowedAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counterMessage, setCounterMessage] = useState("");

  if (allowedActions.length === 0) {
    return (
      <section className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
        <p className="text-sm font-semibold text-zinc-100">Actions</p>
        <p className="mt-2 text-xs text-zinc-500">No actions are available for this offer status.</p>
      </section>
    );
  }

  async function runAction(action: AllowedAction) {
    setError(null);
    setBusyAction(action);
    try {
      const payload =
        action === "counter"
          ? { messageToRecipient: counterMessage.trim() || null }
          : undefined;
      const res = await fetch(`/api/trade/offers/${encodeURIComponent(offerId)}/${action}`, {
        method: "POST",
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? `Could not ${action} offer.`);
        return;
      }
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
      <p className="text-sm font-semibold text-zinc-100">Actions</p>
      <p className="mt-1 text-xs text-zinc-500">Only participants can change offer status.</p>
      {allowedActions.includes("counter") ? (
        <textarea
          value={counterMessage}
          onChange={(e) => setCounterMessage(e.target.value)}
          rows={3}
          placeholder="Optional counter note"
          className="mt-2 w-full rounded-xl border border-white/10 bg-[#111118] px-3 py-2 text-xs text-zinc-100 outline-none ring-gold/20 placeholder:text-zinc-600 focus:border-gold/35 focus:ring-2"
        />
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {allowedActions.includes("accept") ? (
          <button
            type="button"
            disabled={busyAction != null}
            onClick={() => void runAction("accept")}
            className="rounded-full bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-60"
          >
            {busyAction === "accept" ? "Accepting..." : "Accept"}
          </button>
        ) : null}
        {allowedActions.includes("decline") ? (
          <button
            type="button"
            disabled={busyAction != null}
            onClick={() => void runAction("decline")}
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-60"
          >
            {busyAction === "decline" ? "Declining..." : "Decline"}
          </button>
        ) : null}
        {allowedActions.includes("cancel") ? (
          <button
            type="button"
            disabled={busyAction != null}
            onClick={() => void runAction("cancel")}
            className="rounded-full border border-rose-400/30 bg-rose-950/20 px-4 py-2 text-xs font-semibold text-rose-200 disabled:opacity-60"
          >
            {busyAction === "cancel" ? "Cancelling..." : "Cancel"}
          </button>
        ) : null}
        {allowedActions.includes("counter") ? (
          <button
            type="button"
            disabled={busyAction != null}
            onClick={() => void runAction("counter")}
            className="rounded-full border border-gold/35 bg-gold/10 px-4 py-2 text-xs font-semibold text-gold-bright disabled:opacity-60"
          >
            {busyAction === "counter" ? "Sending..." : "Send counter"}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </section>
  );
}
