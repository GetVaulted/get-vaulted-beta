"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  offerId: string;
  canMarkShipped: boolean;
  alreadyShipped: boolean;
  canConfirmReceived: boolean;
  alreadyReceived: boolean;
  completed: boolean;
  viewerLabelUrl: string | null;
  viewerTrackingNumber: string | null;
  partnerTrackingNumber: string | null;
  partnerTrackingUrl: string | null;
  partnerShipped: boolean;
  partnerReceived: boolean;
};

/** Post-label ship / receive steps for an accepted trade. */
export function TradeFulfillmentActions({
  offerId,
  canMarkShipped,
  alreadyShipped,
  canConfirmReceived,
  alreadyReceived,
  completed,
  viewerLabelUrl,
  viewerTrackingNumber,
  partnerTrackingNumber,
  partnerTrackingUrl,
  partnerShipped,
  partnerReceived,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"ship" | "receive" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const postAction = async (path: "mark-shipped" | "confirm-received") => {
    setBusy(path === "mark-shipped" ? "ship" : "receive");
    setError(null);
    try {
      const res = await fetch(`/api/trade/offers/${encodeURIComponent(offerId)}/${path}`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; completed?: boolean };
      if (!res.ok) {
        setError(body.error ?? "Could not update fulfillment.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not update fulfillment.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-white/[0.08] bg-black/25 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Fulfillment</p>
      <ol className="space-y-1.5 text-xs text-zinc-400">
        <li>1. Pay fee + buy your label</li>
        <li>2. Ship with tracking, then mark shipped</li>
        <li>3. Confirm receipt when their package arrives — both confirms complete the trade</li>
      </ol>

      {viewerLabelUrl ? (
        <a
          href={viewerLabelUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-sm font-semibold text-gold-bright hover:underline"
        >
          Download your shipping label
          {viewerTrackingNumber ? ` · ${viewerTrackingNumber}` : ""}
        </a>
      ) : null}

      {partnerTrackingNumber || partnerTrackingUrl ? (
        <p className="text-sm text-zinc-300">
          Partner tracking:{" "}
          {partnerTrackingUrl ? (
            <a
              href={partnerTrackingUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-gold-bright hover:underline"
            >
              {partnerTrackingNumber ?? "Track package"}
            </a>
          ) : (
            <span className="font-semibold text-zinc-100">{partnerTrackingNumber}</span>
          )}
          {partnerShipped ? " · marked shipped" : " · label ready"}
          {partnerReceived ? " · they confirmed your package" : null}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">Partner tracking appears once they buy their label.</p>
      )}

      {completed ? (
        <p className="text-sm font-semibold text-emerald-200">Trade completed — both sides confirmed receipt.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {alreadyShipped ? (
            <p className="text-sm font-semibold text-emerald-200">You marked your package shipped.</p>
          ) : (
            <button
              type="button"
              disabled={!canMarkShipped || busy !== null}
              onClick={() => void postAction("mark-shipped")}
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/20 bg-white/[0.04] px-4 text-sm font-semibold text-zinc-100 transition hover:border-gold/35 hover:text-gold-bright disabled:opacity-50"
            >
              {busy === "ship" ? "Saving…" : "Mark shipped"}
            </button>
          )}
          {alreadyReceived ? (
            <p className="text-sm font-semibold text-emerald-200">You confirmed receipt.</p>
          ) : (
            <button
              type="button"
              disabled={!canConfirmReceived || busy !== null}
              onClick={() => void postAction("confirm-received")}
              className="inline-flex h-10 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-950/30 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-950/45 disabled:opacity-50"
            >
              {busy === "receive" ? "Saving…" : "Confirm received"}
            </button>
          )}
        </div>
      )}
      {!canConfirmReceived && !alreadyReceived && !completed && partnerShipped === false ? (
        <p className="text-[11px] text-zinc-500">Confirm received unlocks after your partner marks shipped.</p>
      ) : null}
      {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
    </div>
  );
}
