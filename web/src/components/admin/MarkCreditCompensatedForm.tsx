"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Records the Stripe transfer that paid a seller back for one order's credit gap. Does not move money. */
export function MarkCreditCompensatedForm({ orderId, amountLabel }: { orderId: string; amountLabel: string }) {
  const router = useRouter();
  const [transferId, setTransferId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/credit-compensation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, stripeTransferId: transferId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save that.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          id={`transfer-${orderId}`}
          value={transferId}
          onChange={(e) => setTransferId(e.target.value)}
          placeholder="tr_..."
          aria-label={`Stripe transfer id for ${amountLabel}`}
          className="w-44 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-zinc-600 focus:border-gold/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || transferId.trim().length < 4}
          className="rounded-lg border border-gold/40 px-2 py-1 text-xs font-semibold text-gold-bright disabled:opacity-40"
        >
          {busy ? "Saving…" : "Mark compensated"}
        </button>
      </div>
      {error ? <p className="text-[11px] text-rose-300">{error}</p> : null}
    </form>
  );
}
