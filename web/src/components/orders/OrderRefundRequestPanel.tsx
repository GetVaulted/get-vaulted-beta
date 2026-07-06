"use client";

import { useCallback, useEffect, useState } from "react";
import {
  refundRequestStatusLabel,
  type LiveOrderRefundKind,
} from "@/lib/order-refund-eligibility";
import type { OrderRefundRequestDto } from "@/lib/order-refund-types";

type Eligibility = {
  kind: LiveOrderRefundKind | null;
  blockedReason: string | null;
};

type Props = {
  orderId: string;
  role: "buyer" | "seller";
};

function blockedMessage(code: string | null): string {
  switch (code) {
    case "NOT_LIVE_ORDER":
      return "Refund requests are only available for live show orders.";
    case "IN_TRANSIT":
      return "Cancel and return requests are unavailable while the package is in transit. Wait until delivery.";
    case "RETURN_WINDOW_EXPIRED":
      return "The 2-day return window after delivery has expired.";
    case "NOT_PAID":
      return "This order is not eligible for a refund yet.";
    case "ALREADY_REFUNDED":
      return "This order has already been refunded.";
    case "ESCROW_NOT_SUPPORTED":
      return "Escrow orders must be handled through the escrow provider.";
    default:
      return "This order is not eligible for a refund request right now.";
  }
}

export function OrderRefundRequestPanel({ orderId, role }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [request, setRequest] = useState<OrderRefundRequestDto | null>(null);
  const [reason, setReason] = useState("");
  const [photoUrlsText, setPhotoUrlsText] = useState("");
  const [denyReason, setDenyReason] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/refund-request`, { cache: "no-store" });
      if (!res.ok) {
        setEligibility(null);
        setRequest(null);
        return;
      }
      const j = (await res.json()) as {
        eligibility: Eligibility;
        request: OrderRefundRequestDto | null;
      };
      setEligibility(j.eligibility);
      setRequest(j.request);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchAction(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/refund-request`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string; request?: OrderRefundRequestDto };
      if (!res.ok) {
        setError(j.error ?? "Request failed");
        return;
      }
      setRequest(j.request ?? null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function submitBuyerRequest(kind: LiveOrderRefundKind) {
    setBusy(true);
    setError(null);
    const photoUrls = photoUrlsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/refund-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, reason, photoUrls }),
      });
      const j = (await res.json()) as { error?: string; request?: OrderRefundRequestDto };
      if (!res.ok) {
        setError(j.error ?? "Request failed");
        return;
      }
      setRequest(j.request ?? null);
      setReason("");
      setPhotoUrlsText("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="mt-6 text-sm text-zinc-500">Loading refund options…</p>;
  }

  if (!eligibility?.kind && !request) {
    if (eligibility?.blockedReason === "NOT_LIVE_ORDER") return null;
    return (
      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold text-foreground">Cancel & refund</h2>
        <p className="mt-2 text-sm text-zinc-400">{blockedMessage(eligibility?.blockedReason ?? null)}</p>
      </section>
    );
  }

  const terminal = request?.status === "refunded" || request?.status === "support_denied";

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-sm font-semibold text-foreground">Cancel & refund</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Live show orders: cancel before ship, or return within 2 days of delivery (shipping defect only).
      </p>

      {request ? (
        <div className="mt-4 space-y-2 text-sm">
          <p>
            <span className="text-zinc-500">Status:</span>{" "}
            <span className="font-medium text-foreground">{refundRequestStatusLabel(request.status)}</span>
          </p>
          <p className="text-zinc-400">
            {request.kind === "cancel" ? "Cancel request" : "Return request"} — {request.reason}
          </p>
          {request.sellerDenyReason ? (
            <p className="text-amber-200/90">Seller note: {request.sellerDenyReason}</p>
          ) : null}
          {request.supportNote ? <p className="text-sky-200/90">Support note: {request.supportNote}</p> : null}
          {request.returnTrackingNumber ? (
            <p className="text-zinc-300">
              Return tracking: {request.returnTrackingNumber}
              {request.returnCarrier ? ` (${request.returnCarrier})` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

      {!request && role === "buyer" && eligibility?.kind ? (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-zinc-400">
            Reason {eligibility.kind === "return" ? "(shipping defect)" : ""}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
              placeholder={
                eligibility.kind === "return"
                  ? "Describe the shipping damage or defect…"
                  : "Why do you need to cancel?"
              }
            />
          </label>
          {eligibility.kind === "return" ? (
            <label className="block text-xs font-medium text-zinc-400">
              Photo URLs (one per line)
              <textarea
                value={photoUrlsText}
                onChange={(e) => setPhotoUrlsText(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                placeholder="https://…"
              />
            </label>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitBuyerRequest(eligibility.kind!)}
            className="rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold-bright hover:bg-gold/20 disabled:opacity-50"
          >
            {eligibility.kind === "cancel" ? "Request cancel & refund" : "Request return & refund"}
          </button>
        </div>
      ) : null}

      {request?.status === "pending_seller" && role === "seller" ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void patchAction({ action: "seller_respond", approve: true })}
              className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              Approve
            </button>
          </div>
          <label className="block text-xs font-medium text-zinc-400">
            Deny reason
            <input
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void patchAction({ action: "seller_respond", approve: false, denyReason })}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      ) : null}

      {!request && role === "seller" && eligibility?.kind === "cancel" ? (
        <div className="mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void patchAction({ action: "seller_direct_cancel", reason: "Seller cancelled order." })}
            className="rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
          >
            Cancel & refund buyer directly
          </button>
        </div>
      ) : null}

      {request?.status === "seller_denied" && role === "buyer" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void patchAction({ action: "buyer_escalate" })}
          className="mt-4 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold-bright hover:bg-gold/20 disabled:opacity-50"
        >
          Escalate to Get Vaulted support
        </button>
      ) : null}

      {(request?.status === "awaiting_return" || request?.status === "return_in_transit") && role === "buyer" ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-zinc-400">You pay return shipping. Add tracking once shipped.</p>
          <input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="Tracking number"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
          />
          <input
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            placeholder="Carrier (optional)"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void patchAction({ action: "buyer_return_tracking", trackingNumber, carrier })}
            className="rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold-bright hover:bg-gold/20 disabled:opacity-50"
          >
            Save return tracking
          </button>
        </div>
      ) : null}

      {request?.status === "awaiting_return" && role === "seller" && request.kind === "return" ? (
        <p className="mt-4 text-xs text-zinc-400">
          Waiting for the buyer to ship the return and add tracking. You can confirm receipt once it&rsquo;s on its way.
        </p>
      ) : null}

      {request?.status === "return_in_transit" && role === "seller" && request.kind === "return" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void patchAction({ action: "seller_confirm_return" })}
          className="mt-4 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          Confirm return received & refund
        </button>
      ) : null}

      {request?.status === "refund_processing" ? (
        <p className="mt-3 text-sm text-zinc-400">
          Your refund is processing with our payment provider. This is usually quick — if it&rsquo;s still showing
          here after a while, reach out to Get Vaulted support and we&rsquo;ll check on it.
        </p>
      ) : null}

      {terminal && request?.status === "refunded" ? (
        <p className="mt-3 text-sm text-emerald-200">Refund completed.</p>
      ) : null}
    </section>
  );
}
