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
  compact?: boolean;
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  href?: string;
  download?: string;
}) {
  const cls = primary
    ? "border-gold/40 bg-gold/12 text-gold-bright hover:bg-gold/18"
    : "border-white/10 bg-white/[0.03] text-zinc-200 hover:border-white/18 hover:bg-white/[0.05]";
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        download={download}
        className={`inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-bold transition ${cls}`}
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
      className={`inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-bold transition disabled:opacity-50 ${cls}`}
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
    canCreateLabel,
    onCreateLabel,
    createLabelBusy,
    onRepairLabel,
    repairLabelBusy,
    onRegenerateLabel,
    regenerateLabelBusy,
  } = props;

  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const purchased = orderHasPurchasedLabel({ shippoTransactionId, labelUrl, fulfillmentStatus });
  const hasFile = orderHasLabelFile(labelUrl);
  const canRepair = purchased && !hasFile && Boolean(shippoTransactionId?.trim()) && onRepairLabel;
  const canRegenerate = purchased && !hasFile && onRegenerateLabel;
  const busy = createLabelBusy || repairLabelBusy || regenerateLabelBusy;

  if (!purchased && !canCreateLabel) return null;

  const onCopy = async () => {
    if (!trackingNumber?.trim()) return;
    const ok = await copyTrackingNumber(trackingNumber.trim());
    setCopyMsg(ok ? "Copied" : "Could not copy");
    window.setTimeout(() => setCopyMsg(null), 2000);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(165deg,rgba(14,116,144,0.14)_0%,rgba(10,10,13,0.95)_42%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-200/85">Shipping label</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {hasFile ? "Print, download, or share tracking." : "Recover or regenerate your label below."}
        </p>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {purchased && !hasFile ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-950/25 px-3 py-3">
            <p className="text-xs font-semibold text-amber-100">Label file missing</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/75">
              The label was purchased but the PDF is not available. Retry lookup from Shippo or regenerate a new
              label.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {canRepair ? (
                <ActionBtn primary disabled={busy} onClick={() => void onRepairLabel!()}>
                  {repairLabelBusy ? "Looking up…" : "Retry label lookup"}
                </ActionBtn>
              ) : null}
              {canRegenerate ? (
                <ActionBtn disabled={busy} onClick={() => void onRegenerateLabel!()}>
                  {regenerateLabelBusy ? "Regenerating…" : "Regenerate label"}
                </ActionBtn>
              ) : null}
              <ActionBtn href="mailto:support@shopgetvaulted.com?subject=Missing%20shipping%20label">Contact support</ActionBtn>
            </div>
          </div>
        ) : null}

        {hasFile || canCreateLabel ? (
          <div className="flex flex-wrap gap-2">
            {hasFile && labelUrl ? (
              <>
                <ActionBtn primary onClick={() => openLabelForPrint(labelUrl)}>
                  Print label
                </ActionBtn>
                <ActionBtn href={labelUrl} download={`shipping-label-${orderId.slice(0, 8)}.pdf`}>
                  Download label
                </ActionBtn>
              </>
            ) : null}
            {trackingNumber?.trim() ? (
              <ActionBtn onClick={() => void onCopy()}>{copyMsg ?? "Copy tracking"}</ActionBtn>
            ) : null}
            {trackingUrl?.trim() ? (
              <ActionBtn href={trackingUrl}>Open tracking</ActionBtn>
            ) : null}
            {canCreateLabel && onCreateLabel ? (
              <ActionBtn primary disabled={busy} onClick={() => void onCreateLabel()}>
                {createLabelBusy ? "Creating…" : "Create label"}
              </ActionBtn>
            ) : null}
          </div>
        ) : null}

        {purchased ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Carrier</dt>
              <dd className="mt-0.5 font-medium text-zinc-200">{carrier?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Service</dt>
              <dd className="mt-0.5 font-medium text-zinc-200">{service?.trim() || "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Tracking number</dt>
              <dd className="mt-0.5 font-mono text-xs text-zinc-200">{trackingNumber?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Tracking status</dt>
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
