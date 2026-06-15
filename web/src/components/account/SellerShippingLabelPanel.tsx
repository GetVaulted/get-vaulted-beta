"use client";

import { useState } from "react";
import {
  copyTrackingNumber,
  openLabelForPrint,
  orderHasLabelFile,
  orderHasPurchasedLabel,
  sellerTrackingStatusLabel,
} from "@/lib/seller-shipping-label-state";

export type SellerShippingLabelPanelProps = {
  orderId: string;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  shippoTransactionId: string | null;
  labelCreatedAt: string | null;
  fulfillmentStatus: string;
  shippingStatus: string | null;
  canCreateLabel?: boolean;
  onCreateLabel?: () => void | Promise<void>;
  createLabelBusy?: boolean;
  onRepairLabel?: () => void | Promise<void>;
  repairLabelBusy?: boolean;
  onRegenerateLabel?: () => void | Promise<void>;
  regenerateLabelBusy?: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export function SellerShippingLabelPanel({
  orderId,
  carrier,
  service,
  trackingNumber,
  trackingUrl,
  labelUrl,
  shippoTransactionId,
  labelCreatedAt,
  fulfillmentStatus,
  shippingStatus,
  canCreateLabel,
  onCreateLabel,
  createLabelBusy,
  onRepairLabel,
  repairLabelBusy,
  onRegenerateLabel,
  regenerateLabelBusy,
}: SellerShippingLabelPanelProps) {
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const purchased = orderHasPurchasedLabel({ shippoTransactionId, labelUrl, fulfillmentStatus });
  const hasFile = orderHasLabelFile(labelUrl);
  const canRepair = purchased && !hasFile && Boolean(shippoTransactionId?.trim()) && onRepairLabel;
  const canRegenerate = purchased && !hasFile && onRegenerateLabel;

  if (!purchased && !canCreateLabel) return null;

  const onCopy = async () => {
    if (!trackingNumber?.trim()) return;
    const ok = await copyTrackingNumber(trackingNumber.trim());
    setCopyMsg(ok ? "Copied" : "Could not copy");
    window.setTimeout(() => setCopyMsg(null), 2000);
  };

  return (
    <div className="rounded-2xl border border-sky-500/25 bg-sky-950/20 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-200/90">Shipping label</p>
      <p className="mt-1 text-xs text-zinc-500">Print or download your label any time after purchase.</p>

      {purchased ? (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Carrier</dt>
            <dd className="mt-0.5 text-zinc-200">{carrier?.trim() || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Service</dt>
            <dd className="mt-0.5 text-zinc-200">{service?.trim() || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Tracking number</dt>
            <dd className="mt-0.5 font-mono text-xs text-zinc-200">{trackingNumber?.trim() || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Tracking status</dt>
            <dd className="mt-0.5 text-zinc-200">
              {sellerTrackingStatusLabel(fulfillmentStatus, shippingStatus)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Label created</dt>
            <dd className="mt-0.5 text-zinc-200">{formatDate(labelCreatedAt)}</dd>
          </div>
        </dl>
      ) : null}

      {purchased && !hasFile ? (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-100/90">
          Label was created, but the label file is missing. Tap Retrieve label below, or Regenerate label to
          purchase a new one.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {hasFile && labelUrl ? (
          <>
            <button
              type="button"
              onClick={() => openLabelForPrint(labelUrl)}
              className="rounded-full border border-gold/35 bg-gold/10 px-4 py-2 text-xs font-bold text-gold-bright transition hover:bg-gold/15"
            >
              Print label
            </button>
            <a
              href={labelUrl}
              target="_blank"
              rel="noreferrer"
              download={`shipping-label-${orderId.slice(0, 8)}.pdf`}
              className="rounded-full border border-white/12 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-gold/35 hover:text-gold-bright"
            >
              Download label
            </a>
          </>
        ) : null}
        {trackingNumber?.trim() ? (
          <button
            type="button"
            onClick={() => void onCopy()}
            className="rounded-full border border-white/12 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/20"
          >
            {copyMsg ?? "Copy tracking"}
          </button>
        ) : null}
        {trackingUrl?.trim() ? (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/12 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:border-gold/35 hover:text-gold-bright"
          >
            Open tracking
          </a>
        ) : null}
        {canRepair ? (
          <button
            type="button"
            disabled={repairLabelBusy || regenerateLabelBusy}
            onClick={() => void onRepairLabel()}
            className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-bold text-sky-100 transition hover:bg-sky-500/15 disabled:opacity-50"
          >
            {repairLabelBusy ? "Retrieving…" : "Retrieve label"}
          </button>
        ) : null}
        {canRegenerate ? (
          <button
            type="button"
            disabled={repairLabelBusy || regenerateLabelBusy}
            onClick={() => void onRegenerateLabel()}
            className="rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-500/15 disabled:opacity-50"
          >
            {regenerateLabelBusy ? "Regenerating…" : "Regenerate label"}
          </button>
        ) : null}
        {canCreateLabel && onCreateLabel ? (
          <button
            type="button"
            disabled={createLabelBusy}
            onClick={() => void onCreateLabel()}
            className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-bold text-sky-100 transition hover:bg-sky-500/15 disabled:opacity-50"
          >
            {createLabelBusy ? "Creating…" : "Create label"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
