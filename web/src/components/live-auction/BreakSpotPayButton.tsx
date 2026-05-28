"use client";

import { useState } from "react";
import { payLiveBreakSpotWithSca } from "@/lib/live-buy-now-client";

export function BreakSpotPayButton({
  liveRoomId,
  breakSpotId,
  disabled,
  onPaid,
  onPaymentFailed,
}: {
  liveRoomId: string;
  breakSpotId: string;
  disabled?: boolean;
  onPaid?: () => void;
  onPaymentFailed?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await payLiveBreakSpotWithSca({ liveRoomId, breakSpotId });
      if (!res.ok) {
        setError(res.error);
        if (res.paymentFailed) onPaymentFailed?.();
        return;
      }
      onPaid?.();
    } catch {
      setError("Payment failed.");
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
