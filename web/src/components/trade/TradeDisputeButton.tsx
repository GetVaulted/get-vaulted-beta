"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Participant: open a trade dispute (holds cash, freezes fulfillment). */
export function TradeDisputeButton({
  offerId,
  disabled,
}: {
  offerId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trade/offers/${encodeURIComponent(offerId)}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not open dispute.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not open dispute.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-rose-300/90 underline-offset-2 hover:underline disabled:opacity-50"
      >
        Open dispute
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-rose-300/25 bg-rose-950/20 p-3">
      <p className="text-xs text-zinc-400">
        Opening a dispute freezes mark-shipped / confirm-received and keeps any trade cash held until Get Vaulted
        resolves it. Items are not in custody — describe the problem clearly.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="What went wrong? (tracking, wrong item, no ship, etc.)"
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSubmit()}
          className="inline-flex h-9 items-center rounded-full bg-rose-600/90 px-4 text-xs font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Submit dispute"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="inline-flex h-9 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-zinc-300"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
    </div>
  );
}
