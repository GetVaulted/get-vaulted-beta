"use client";

import { loadStripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { LiveBuyerPaymentFailureDTO } from "@/lib/live-room-serialize";

type Props = {
  liveRoomId: string;
  failure: LiveBuyerPaymentFailureDTO;
  onResolved: () => void;
  onOpenWallet: () => void;
};

export function LivePaymentFailureBlocker({ liveRoomId, failure, onResolved, onOpenWallet }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const retryPayment = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/payment-failure/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ failureId: failure.id }),
      });
      const payload = (await res.json()) as {
        error?: string;
        paid?: boolean;
        ok?: boolean;
        message?: string;
        requiresAction?: boolean;
        clientSecret?: string;
        publishableKey?: string;
      };
      if (payload.paid || payload.ok) {
        setSuccess(true);
        onResolved();
        return;
      }
      if (payload.requiresAction && payload.clientSecret) {
        const pk = payload.publishableKey?.trim() || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";
        const stripe = pk ? await loadStripe(pk) : null;
        if (!stripe) {
          setError("Complete verification in your Vault Wallet, then tap Fix Payment again.");
          return;
        }
        const conf = await stripe.confirmCardPayment(payload.clientSecret);
        if (conf.error) {
          setError(conf.error.message ?? "Verification failed.");
          return;
        }
        const syncRes = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/payment-failure/retry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ failureId: failure.id, action: "sync" }),
        });
        const syncPayload = (await syncRes.json()) as { error?: string; paid?: boolean; ok?: boolean; message?: string };
        if (syncRes.ok && (syncPayload.paid || syncPayload.ok)) {
          setSuccess(true);
          onResolved();
          return;
        }
        setError(syncPayload.error ?? "Payment not completed.");
        return;
      }
      setError(typeof payload.error === "string" ? payload.error : "Payment failed. Update your card and try again.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }, [failure.id, liveRoomId, onResolved]);

  const handleFixPayment = () => {
    onOpenWallet();
    void retryPayment();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-payment-failure-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-rose-400/30 bg-zinc-950 p-6 shadow-2xl">
        <p id="live-payment-failure-title" className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">
          Payment required
        </p>
        <h2 className="mt-2 text-lg font-bold text-white">
          {success
            ? "Payment successful. You're all set."
            : "Payment failed. Update your card to continue in this show."}
        </h2>
        {failure.itemTitle ? (
          <p className="mt-2 text-sm text-zinc-400">
            {failure.itemTitle} · ${failure.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        ) : null}
        {failure.failureReason && !success ? (
          <p className="mt-2 text-xs text-rose-200/90">{failure.failureReason}</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        {!success ? (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={handleFixPayment}
              className="flex-1 rounded-full bg-amber-400 px-4 py-3 text-sm font-black uppercase tracking-wide text-zinc-950 disabled:opacity-50"
            >
              {busy ? "Processing…" : "Fix payment"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => router.push("/live")}
              className="flex-1 rounded-full border border-white/15 bg-black/50 px-4 py-3 text-sm font-bold text-zinc-100"
            >
              Leave room
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onResolved}
            className="mt-6 w-full rounded-full bg-emerald-500/20 px-4 py-3 text-sm font-bold text-emerald-100"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
