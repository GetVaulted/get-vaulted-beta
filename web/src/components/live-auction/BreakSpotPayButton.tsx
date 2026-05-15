"use client";

import { useState } from "react";

export function BreakSpotPayButton({
  liveRoomId,
  breakSpotId,
  disabled,
}: {
  liveRoomId: string;
  breakSpotId: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "break_spot",
          breakSpotId,
          successPath: `/live/${encodeURIComponent(liveRoomId)}`,
          cancelPath: `/live/${encodeURIComponent(liveRoomId)}?checkout=canceled`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }
      if (data.url) window.location.assign(data.url);
    } catch {
      setError("Checkout failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 space-y-1">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={pay}
        className="rounded-md border border-emerald-500/40 bg-emerald-950/40 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-100 hover:bg-emerald-900/50 disabled:opacity-50"
      >
        {busy ? "…" : "Pay spot"}
      </button>
      {error ? <p className="text-[9px] text-rose-300">{error}</p> : null}
    </div>
  );
}
