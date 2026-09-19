"use client";

import { useState } from "react";

type Props = {
  orderId: string;
  payoutStatus: string;
  fulfillmentStatus: string;
  deliveryConfirmedAt: string | null;
  payoutBlockedReason: string | null;
  payoutHoldUntil: string | null;
  payoutReserveAmountCents: number;
  payoutMethod: string;
  sellerPayoutProcessor?: string | null;
  processorTransferId?: string | null;
  paypalPayoutStatus?: string | null;
  payoutEvaluation: {
    sellerEligible: boolean;
    instantPayoutAllowed: boolean;
    disqualifiers: string[];
    sellerRequirementsFailed: string[];
  } | null;
  onUpdated: () => void;
};

export function AdminOrderPayoutPanel({
  orderId,
  payoutStatus,
  fulfillmentStatus,
  deliveryConfirmedAt,
  payoutBlockedReason,
  payoutHoldUntil,
  payoutReserveAmountCents,
  payoutMethod,
  sellerPayoutProcessor,
  processorTransferId,
  paypalPayoutStatus,
  payoutEvaluation,
  onUpdated,
}: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: string) => {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Action failed.");
        return;
      }
      setReason("");
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const reserveUsd = (payoutReserveAmountCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return (
    <section className="mt-6 space-y-4 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
      <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Payout controls</h2>

      {error ? (
        <p className="rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-rose-100">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Payout status</p>
          <p className="mt-1 capitalize text-zinc-100">{payoutStatus.replace(/_/g, " ")}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Delivery</p>
          <p className="mt-1 capitalize text-zinc-100">{fulfillmentStatus}</p>
          {deliveryConfirmedAt ? (
            <p className="text-[10px] text-zinc-600">{new Date(deliveryConfirmedAt).toLocaleString()}</p>
          ) : null}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Method</p>
          <p className="mt-1 capitalize text-zinc-100">{payoutMethod.replace(/_/g, " ")}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Payout processor</p>
          <p className="mt-1 text-zinc-100">{sellerPayoutProcessor ?? "STRIPE"}</p>
          {processorTransferId ? (
            <p className="mt-0.5 break-all font-mono text-[10px] text-zinc-500">{processorTransferId}</p>
          ) : null}
          {paypalPayoutStatus ? (
            <p className="mt-0.5 text-[10px] text-zinc-500">PayPal status: {paypalPayoutStatus}</p>
          ) : null}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Reserve / hold</p>
          <p className="mt-1 text-zinc-100">
            {reserveUsd}
            {payoutHoldUntil ? ` · until ${new Date(payoutHoldUntil).toLocaleDateString()}` : ""}
          </p>
        </div>
      </div>

      {payoutBlockedReason ? (
        <p className="text-amber-200/90">
          Blocked/review reason: <span className="text-zinc-200">{payoutBlockedReason}</span>
        </p>
      ) : null}

      {payoutEvaluation ? (
        <div className="border-t border-white/[0.06] pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Eligibility</p>
          <p className="mt-1 text-zinc-300">
            Seller eligible: {payoutEvaluation.sellerEligible ? "Yes" : "No"} · Instant allowed:{" "}
            {payoutEvaluation.instantPayoutAllowed ? "Yes" : "No"}
          </p>
          {payoutEvaluation.disqualifiers.length > 0 ? (
            <p className="mt-1 text-[10px] text-rose-300/90">
              Disqualifiers: {payoutEvaluation.disqualifiers.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Reason (required)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("release_payout")}
          className={
            payoutStatus === "fast_payout_ready" ||
            payoutStatus === "label_payout_ready" ||
            payoutStatus === "instant_payout_ready"
              ? "rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-3 py-1.5 text-[10px] font-semibold text-emerald-100 disabled:opacity-50"
              : "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-200 disabled:opacity-50"
          }
        >
          {payoutStatus.includes("payout_ready") ? "Push bank payout" : "Release payout"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("block_payout")}
          className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-[10px] font-semibold text-rose-300 disabled:opacity-50"
        >
          Block payout
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("manual_review")}
          className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-[10px] font-semibold text-amber-200 disabled:opacity-50"
        >
          Send to manual review
        </button>
      </div>
    </section>
  );
}
