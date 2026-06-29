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
  shippingAddressIncomplete?: boolean;
  buyerUsername?: string | null;
  canCreateLabel?: boolean;
  onCreateLabel?: () => void | Promise<void>;
  createLabelBusy?: boolean;
  onRepairLabel?: () => void | Promise<void>;
  repairLabelBusy?: boolean;
  onRegenerateLabel?: () => void | Promise<void>;
  regenerateLabelBusy?: boolean;
  labelError?: string | null;
  onMarkShipped?: () => void;
  markShippedBusy?: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function ActionBtn({
  children,
  onClick,
  primary,
  disabled,
  href,
  download,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  href?: string;
  download?: string;
  tone?: "default" | "emerald";
}) {
  const cls = primary
    ? tone === "emerald"
      ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25"
      : "border-gold/40 bg-gold/12 text-gold-bright hover:bg-gold/18"
    : "border-white/10 bg-white/[0.03] text-zinc-200 hover:border-white/18 hover:bg-white/[0.05]";
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        download={download}
        className={`inline-flex h-11 w-full items-center justify-center rounded-xl border px-5 text-sm font-bold transition sm:w-auto ${cls}`}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-11 w-full items-center justify-center rounded-xl border px-5 text-sm font-bold transition disabled:opacity-50 sm:w-auto ${cls}`}
    >
      {children}
    </button>
  );
}

export function SellerShippingLabelPanel(props: SellerShippingLabelPanelProps) {
  const {
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
    shippingAddressIncomplete,
    buyerUsername,
    canCreateLabel,
    onCreateLabel,
    createLabelBusy,
    onRepairLabel,
    repairLabelBusy,
    onRegenerateLabel,
    regenerateLabelBusy,
    labelError,
    onMarkShipped,
    markShippedBusy,
  } = props;

  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const purchased = orderHasPurchasedLabel({ shippoTransactionId, labelUrl, fulfillmentStatus });
  const hasFile = orderHasLabelFile(labelUrl);
  const canRepair = purchased && !hasFile && Boolean(shippoTransactionId?.trim()) && onRepairLabel;
  const canRegenerate = purchased && !hasFile && onRegenerateLabel;
  const busy = createLabelBusy || repairLabelBusy || regenerateLabelBusy || markShippedBusy;
  const labelFailed = fulfillmentStatus === "exception" && !hasFile;
  const readyToShip =
    hasFile && (fulfillmentStatus === "label_created" || fulfillmentStatus === "pending") && onMarkShipped;

  const onCopy = async () => {
    if (!trackingNumber?.trim()) return;
    const ok = await copyTrackingNumber(trackingNumber.trim());
    setCopyMsg(ok ? "Copied" : "Could not copy");
    window.setTimeout(() => setCopyMsg(null), 2000);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0d] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Shipping</p>
        <p className="mt-0.5 text-sm font-semibold text-zinc-100">
          {hasFile
            ? "Label ready"
            : labelFailed
              ? "Label error"
              : canCreateLabel
                ? "Create label"
                : "Tracking"}
        </p>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {shippingAddressIncomplete ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/25 px-3.5 py-3">
            <p className="text-sm font-semibold text-rose-100">Buyer address incomplete</p>
            <p className="mt-1 text-xs leading-relaxed text-rose-100/85">
              Shippo cannot create a label until{" "}
              {buyerUsername ? `@${buyerUsername}` : "the buyer"} saves a complete shipping address in{" "}
              <span className="font-semibold">Account → Wallet</span>.
            </p>
          </div>
        ) : null}

        {labelFailed && !shippingAddressIncomplete ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-3.5 py-3">
            <p className="text-sm font-semibold text-amber-100">Last label attempt failed</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
              Confirm ship-to and your ship-from address, then try again.
            </p>
          </div>
        ) : null}

        {purchased && !hasFile ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-3.5 py-3">
            <p className="text-xs font-semibold text-amber-100">Label file missing</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/75">
              The label was purchased but the PDF is not available.
            </p>
          </div>
        ) : null}

        {labelError ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">
            {labelError}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {hasFile && labelUrl ? (
            <>
              <ActionBtn primary onClick={() => openLabelForPrint(labelUrl)}>
                Print label
              </ActionBtn>
              <ActionBtn href={labelUrl} download={`shipping-label-${orderId.slice(0, 8)}.pdf`}>
                Download
              </ActionBtn>
            </>
          ) : null}
          {readyToShip ? (
            <ActionBtn primary tone="emerald" disabled={busy} onClick={onMarkShipped}>
              {markShippedBusy ? "Saving…" : "Mark shipped"}
            </ActionBtn>
          ) : null}
          {canCreateLabel && onCreateLabel && !shippingAddressIncomplete ? (
            <ActionBtn primary disabled={busy} onClick={() => void onCreateLabel()}>
              {createLabelBusy ? "Creating…" : labelFailed ? "Retry label" : "Create label"}
            </ActionBtn>
          ) : null}
          {canRepair ? (
            <ActionBtn disabled={busy} onClick={() => void onRepairLabel!()}>
              {repairLabelBusy ? "Looking up…" : "Retry lookup"}
            </ActionBtn>
          ) : null}
          {canRegenerate ? (
            <ActionBtn disabled={busy} onClick={() => void onRegenerateLabel!()}>
              {regenerateLabelBusy ? "Regenerating…" : "Regenerate"}
            </ActionBtn>
          ) : null}
          {trackingNumber?.trim() ? (
            <ActionBtn onClick={() => void onCopy()}>{copyMsg ?? "Copy tracking"}</ActionBtn>
          ) : null}
          {trackingUrl?.trim() ? <ActionBtn href={trackingUrl}>Track package</ActionBtn> : null}
        </div>

        {purchased ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.06] pt-4 text-sm">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Carrier</dt>
              <dd className="mt-0.5 font-medium text-zinc-200">{carrier?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Service</dt>
              <dd className="mt-0.5 font-medium text-zinc-200">{service?.trim() || "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Tracking</dt>
              <dd className="mt-0.5 font-mono text-xs text-zinc-200">{trackingNumber?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Status</dt>
              <dd className="mt-0.5 text-zinc-200">{sellerTrackingStatusLabel(fulfillmentStatus, shippingStatus)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Label created</dt>
              <dd className="mt-0.5 text-zinc-200">{formatDate(labelCreatedAt)}</dd>
            </div>
          </dl>
        ) : null}
      </div>
    </section>
  );
}
