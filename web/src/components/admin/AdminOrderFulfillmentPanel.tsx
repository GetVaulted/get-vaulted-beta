"use client";

import { useState } from "react";
import { adminButtonPrimaryClassName, adminPanelClassName } from "@/components/admin/AdminCommandShell";

type Action = "set_tracking" | "mark_shipped" | "mark_delivered";

const COPY: Record<Action, { label: string; effect: string }> = {
  set_tracking: { label: "Fix tracking", effect: "Saves the carrier and tracking number. Nothing else changes." },
  mark_shipped: {
    label: "Mark shipped",
    effect: "Sets the order to shipped and re-checks the seller payout. Payout holds and blocks still apply.",
  },
  mark_delivered: {
    label: "Mark delivered",
    effect: "Confirms delivery and re-checks the seller payout. Payout holds and blocks still apply.",
  },
};

const ERRORS: Record<string, string> = {
  REASON_REQUIRED: "Write a reason first (at least 5 characters).",
  ORDER_NOT_PAID: "This order isn't paid.",
  ESCROW_USE_ESCROW_FLOW: "Escrow orders use the escrow controls above, not this panel.",
  ALREADY_SHIPPED: "Already shipped.",
  ALREADY_DELIVERED: "Already delivered.",
  TRACKING_REQUIRED: "Enter a tracking number.",
};

/** Correct a stuck order's shipping state. Everything is logged with a reason. */
export function AdminOrderFulfillmentPanel({
  orderId,
  fulfillmentStatus,
  onUpdated,
}: {
  orderId: string;
  fulfillmentStatus: string;
  onUpdated: () => void;
}) {
  const [action, setAction] = useState<Action>("set_tracking");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/fulfillment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, carrier, trackingNumber: tracking, reason }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMsg({ ok: true, text: "Done." });
        setReason("");
        setConfirming(false);
        onUpdated();
      } else {
        setMsg({ ok: false, text: ERRORS[j.error ?? ""] ?? `Failed: ${j.error ?? res.status}` });
        setConfirming(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${adminPanelClassName} mt-6 p-4 text-xs`}>
      <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Fix shipping status</h2>
      <p className="mt-2 text-zinc-500">Current: {fulfillmentStatus}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="fix-action" className="sr-only">
          Action
        </label>
        <select
          id="fix-action"
          value={action}
          onChange={(e) => {
            setAction(e.target.value as Action);
            setConfirming(false);
          }}
          className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
        >
          {(Object.keys(COPY) as Action[]).map((a) => (
            <option key={a} value={a}>
              {COPY[a].label}
            </option>
          ))}
        </select>
        {action !== "mark_delivered" ? (
          <>
            <input
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              aria-label="Carrier"
              placeholder="Carrier (USPS, UPS…)"
              className="rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-xs text-zinc-200"
            />
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              aria-label="Tracking number"
              placeholder="Tracking number"
              className="rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-xs text-zinc-200"
            />
          </>
        ) : null}
      </div>
      <p className="mt-2 text-zinc-500">{COPY[action].effect}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Reason"
        rows={2}
        placeholder="Reason (required, saved to the activity log)"
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
      />
      {confirming ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-zinc-300">{COPY[action].label}?</span>
          <button type="button" disabled={busy} onClick={() => void run()} className={adminButtonPrimaryClassName}>
            {busy ? "Working…" : "Yes, do it"}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="px-3 text-zinc-400">
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={reason.trim().length < 5}
          onClick={() => setConfirming(true)}
          className={`mt-2 ${adminButtonPrimaryClassName}`}
        >
          {COPY[action].label}…
        </button>
      )}
      {msg ? <p className={`mt-2 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p> : null}
    </section>
  );
}
