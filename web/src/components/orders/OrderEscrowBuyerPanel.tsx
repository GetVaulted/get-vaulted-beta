"use client";

import { useState } from "react";
import { EscrowStatus } from "@/generated/prisma/enums";

export function OrderEscrowBuyerPanel({
  orderId,
  paymentStatus,
  escrowStatus,
}: {
  orderId: string;
  paymentStatus: string;
  escrowStatus: string | null;
}) {
  const [busy, setBusy] = useState<"approve" | "dispute" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (paymentStatus !== "paid" || !escrowStatus) return null;

  const canApprove =
    escrowStatus === EscrowStatus.seller_shipped ||
    escrowStatus === EscrowStatus.delivered ||
    escrowStatus === EscrowStatus.inspection_period;
  const canDispute =
    escrowStatus !== EscrowStatus.funds_released &&
    escrowStatus !== EscrowStatus.cancelled &&
    escrowStatus !== EscrowStatus.disputed;

  if (!canApprove && !canDispute) return null;

  const post = async (path: "approve" | "dispute") => {
    setMsg(null);
    setBusy(path);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/${path}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Request failed.");
        return;
      }
      window.location.reload();
    } catch {
      setMsg("Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-sky-500/20 bg-sky-950/15 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-200/90">After delivery</p>
      <p className="mt-2 font-mono text-xs text-zinc-400">Status: {escrowStatus.replace(/_/g, " ")}</p>
      {msg ? <p className="mt-2 text-xs font-medium text-rose-300">{msg}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {canApprove ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void post("approve")}
            className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-sky-400 px-6 text-sm font-bold text-zinc-950 transition hover:brightness-110 disabled:opacity-60"
          >
            {busy === "approve" ? "Submitting…" : "Confirm delivery & release payout"}
          </button>
        ) : null}
        {canDispute ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void post("dispute")}
            className="inline-flex h-11 items-center justify-center rounded-full border border-rose-500/40 px-6 text-sm font-semibold text-rose-200 transition hover:bg-rose-950/40 disabled:opacity-60"
          >
            {busy === "dispute" ? "Submitting…" : "Open dispute"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
