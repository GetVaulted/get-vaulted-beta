"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PaymentDeadlineCountdown } from "@/components/orders/PaymentDeadlineCountdown";
import type { SellerLiveShippingDashboard, SellerLiveShippingSessionRow } from "@/lib/seller-live-shipping-dashboard-types";
import type { SellerLabelPrintFormat } from "@/lib/shippo-label-format";
import { openLabelForPrint } from "@/lib/seller-shipping-label-state";
import { LabelSizePicker } from "@/components/account/LabelSizePicker";
import {
  countShipQueueActions,
  orderIdsAwaitingBundledLabel,
  sellerShipQueueEligible,
  sellerShipQueuePhase,
  type SellerShipQueuePhase,
} from "@/lib/seller-ship-queue";

export type ShipWorkspaceOrder = {
  id: string;
  totalUsd: number;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
  shipCity: string;
  shipState: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  shippoTransactionId: string | null;
  paymentDeadlineAt: string | null;
  buyer: { username: string };
  listing: { id: string; title: string; status?: string; images: { url: string }[] };
};

type BundledFeedback = { tone: "error" | "success" | "warning"; message: string };
type ManualParcel = { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };

type Props = {
  orders: ShipWorkspaceOrder[];
  liveShipping: SellerLiveShippingDashboard | null;
  labelBusyId: string | null;
  bundledBusySessionId: string | null;
  bundledSessionFeedback?: Record<string, BundledFeedback>;
  labelError: string | null;
  onCreateLabel: (
    orderId: string,
    manualParcel?: ManualParcel,
    labelFormat?: "letter" | "thermal_4x6",
  ) => void;
  onCreateBundledLabel: (
    sessionId: string,
    manualParcel?: ManualParcel,
    labelFormat?: "letter" | "thermal_4x6",
    selectedRateObjectId?: string,
  ) => void;
  onMarkShipped: (order: ShipWorkspaceOrder) => void;
  onMarkBundleShipped: (session: SellerLiveShippingSessionRow) => void;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

/** Local-calendar-day key (not UTC) so "today" matches what the seller actually sees on their clock. */
function orderDayKey(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "unknown";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "unknown";
  }
}

/** Section heading for a group of same-day orders: "Today" / "Yesterday" / "Tue, Sep 16". */
function formatDateHeading(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Unknown date";
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  } catch {
    return "Unknown date";
  }
}

function SetupBanner({ liveShipping }: { liveShipping: SellerLiveShippingDashboard | null }) {
  const setup = liveShipping?.labelSetup;
  if (!setup || (setup.shippoApiOk && setup.shipFromComplete && setup.shippoTokenPresent)) return null;

  return (
    <div className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm text-amber-50">
      <p className="font-semibold">Before you can print labels</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-100/95">
        {!setup.shipFromComplete ? (
          <li>
            {setup.shipFromNeedsPhoneOnly
              ? "Add a contact phone for your saved ship-from address in "
              : "Add your ship-from address in "}
            <Link href="/account/seller" className="font-semibold text-gold-bright hover:underline">
              Seller HQ
            </Link>
            .
          </li>
        ) : null}
        {!setup.shippoTokenPresent ? (
          <li>Shippo is not configured on the server (contact support if labels fail).</li>
        ) : !setup.shippoApiOk ? (
          <li>Shippo connection failed — check your API key in Shippo settings.</li>
        ) : null}
      </ul>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  tone = "gold",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "gold" | "sky" | "emerald" | "muted";
}) {
  const tones = {
    gold: "bg-gradient-to-r from-gold to-gold-bright text-zinc-950 hover:brightness-110",
    sky: "border border-sky-400/40 bg-sky-500/20 text-sky-50 hover:bg-sky-500/30",
    emerald: "border border-emerald-400/35 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25",
    muted: "border border-white/12 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]",
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 min-w-[6.5rem] items-center justify-center rounded-lg px-3.5 text-[13px] font-bold transition disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function OrderThumb({ url, title }: { url?: string; title: string }) {
  return (
    <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0b0b0e] sm:size-12">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">No img</div>
      )}
      <span className="sr-only">{title}</span>
    </div>
  );
}

const PARCEL_PRESETS: Array<{
  label: string;
  description: string;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}> = [
  { label: "Card mailer", description: "PWE / bubble mailer, a few cards", weightOz: 4, lengthIn: 6, widthIn: 4, heightIn: 1 },
  { label: "Padded mailer", description: "Bubble mailer, stack of cards or small items", weightOz: 8, lengthIn: 9, widthIn: 6, heightIn: 1 },
  { label: "Small box", description: "Graded slab, loose packs, multiple cards", weightOz: 16, lengthIn: 10, widthIn: 7, heightIn: 3 },
  { label: "Medium box", description: "Large haul, mix of items from a break", weightOz: 32, lengthIn: 12, widthIn: 9, heightIn: 5 },
  { label: "Mini helmet", description: "Mini collectible helmet (~1.5 lbs)", weightOz: 24, lengthIn: 11, widthIn: 8, heightIn: 7 },
  { label: "Full-size helmet", description: "Full NFL / MLB helmet (~5 lbs)", weightOz: 80, lengthIn: 14, widthIn: 12, heightIn: 12 },
];

function ShipOrderCard({
  order,
  labelBusyId,
  onCreateLabel,
  onMarkShipped,
  phase,
}: {
  order: ShipWorkspaceOrder;
  labelBusyId: string | null;
  onCreateLabel: (
    orderId: string,
    manualParcel?: ManualParcel,
    labelFormat?: "letter" | "thermal_4x6",
  ) => void;
  onMarkShipped: (order: ShipWorkspaceOrder) => void;
  phase: Exclude<SellerShipQueuePhase, "other">;
}) {
  const thumb = order.listing.images[0]?.url;
  const busy = labelBusyId === order.id;
  const [showParcelModal, setShowParcelModal] = useState(false);
  const [activePreset, setActivePreset] = useState("Card mailer");
  const [labelFormat, setLabelFormat] = useState<SellerLabelPrintFormat>("thermal_4x6");
  const [weightOz, setWeightOz] = useState("4");
  const [lengthIn, setLengthIn] = useState("6");
  const [widthIn, setWidthIn] = useState("4");
  const [heightIn, setHeightIn] = useState("1");

  const applyPreset = (p: (typeof PARCEL_PRESETS)[number]) => {
    setWeightOz(String(p.weightOz));
    setLengthIn(String(p.lengthIn));
    setWidthIn(String(p.widthIn));
    setHeightIn(String(p.heightIn));
    setActivePreset(p.label);
  };

  const parsedParcel = {
    weightOz: parseFloat(weightOz),
    lengthIn: parseFloat(lengthIn),
    widthIn: parseFloat(widthIn),
    heightIn: parseFloat(heightIn),
  };
  const parcelValid = Object.values(parsedParcel).every((v) => Number.isFinite(v) && v > 0);

  return (
    <>
    <article className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-[#0a0a0d] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 gap-3">
        <OrderThumb url={thumb} title={order.listing.title} />
        <div className="min-w-0">
          <p className="line-clamp-2 font-semibold leading-snug text-zinc-100">{order.listing.title}</p>
          <p className="mt-1 text-sm text-zinc-400">
            Ship to <span className="text-zinc-200">{order.shipCity}, {order.shipState}</span>
            <span className="text-zinc-600"> · </span>
            @{order.buyer.username}
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">
            Order {formatDate(order.createdAt)}
            {order.trackingNumber ? (
              <>
                <span className="text-zinc-600"> · </span>
                <span className="font-mono text-zinc-400">{order.trackingNumber}</span>
              </>
            ) : null}
          </p>
          {phase === "wait_payment" && order.paymentDeadlineAt ? (
            <p className="mt-1 text-xs text-amber-200/90">
              Payment due <PaymentDeadlineCountdown deadlineIso={order.paymentDeadlineAt} />
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
        {phase === "needs_label" ? (
          <PrimaryButton tone="gold" disabled={busy} onClick={() => setShowParcelModal(true)}>
            {busy ? "Creating…" : "Create label"}
          </PrimaryButton>
        ) : null}
        {phase === "needs_label" ? (
          <PrimaryButton tone="muted" disabled={busy} onClick={() => onMarkShipped(order)}>
            Ship it yourself
          </PrimaryButton>
        ) : null}
        {(phase === "print_and_ship" || phase === "awaiting_carrier") && order.labelUrl ? (
          <PrimaryButton tone="gold" onClick={() => openLabelForPrint(order.labelUrl!)}>
            {phase === "print_and_ship" ? "Print label" : "Reprint"}
          </PrimaryButton>
        ) : null}
        {phase === "print_and_ship" ? (
          <PrimaryButton tone="emerald" onClick={() => onMarkShipped(order)}>
            Dropped off
          </PrimaryButton>
        ) : null}
        {phase === "awaiting_carrier" ? (
          <span className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-100/90">
            Pending carrier scan
          </span>
        ) : null}
        {phase === "awaiting_carrier" && order.labelUrl ? (
          <button
            type="button"
            onClick={() => openLabelForPrint(order.labelUrl!)}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/12 px-4 text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
          >
            Reprint
          </button>
        ) : null}
        {phase !== "needs_label" && phase !== "wait_payment" && order.trackingUrl ? (
          <a
            href={order.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/12 px-5 text-sm font-semibold text-zinc-200 transition hover:border-gold/35"
          >
            Track
          </a>
        ) : null}
        {phase === "in_transit" && order.labelUrl ? (
          <button
            type="button"
            onClick={() => openLabelForPrint(order.labelUrl!)}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/12 px-4 text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
          >
            Reprint
          </button>
        ) : null}
        {phase === "done" ? (
          <span className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-100/90">
            Delivered
          </span>
        ) : null}
        <Link
          href={`/account/sales/${encodeURIComponent(order.id)}`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 px-4 text-sm font-medium text-zinc-500 transition hover:border-white/20 hover:text-zinc-300"
        >
          Details
        </Link>
      </div>
    </article>

    {showParcelModal ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) setShowParcelModal(false); }}
      >
        <div className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#0e0e12] p-5 shadow-2xl">
          <h2 className="text-base font-bold text-zinc-100">Confirm package details</h2>
          <p className="mt-1 text-[11px] text-zinc-400">
            Select the package type that matches what you&apos;re actually shipping, then adjust if needed.
          </p>
          <div className="mt-3 rounded-lg border border-zinc-700/50 bg-zinc-900/60 px-3 py-2 text-[11px] text-zinc-400">
            <span className="font-semibold text-zinc-300">{order.listing.title}</span>
            {" · "}@{order.buyer.username}
            {" · "}
            {order.shipCity}, {order.shipState}
          </div>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Package type</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {PARCEL_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={`rounded-lg border px-2.5 py-2 text-left transition ${
                  activePreset === p.label
                    ? "border-sky-400/60 bg-sky-500/15 text-sky-50"
                    : "border-white/[0.08] bg-zinc-900/60 text-zinc-300 hover:border-white/20 hover:bg-zinc-800/60"
                }`}
              >
                <p className="text-[11px] font-semibold leading-tight">{p.label}</p>
                <p className="mt-0.5 text-[10px] leading-tight text-zinc-400 line-clamp-2">{p.description}</p>
                <p className="mt-1 font-mono text-[10px] text-zinc-500">
                  {p.weightOz} oz · {p.lengthIn}×{p.widthIn}×{p.heightIn}&quot;
                </p>
              </button>
            ))}
          </div>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Adjust if needed</p>
          <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Weight (oz)", weightOz, setWeightOz],
                ["Length (in)", lengthIn, setLengthIn],
                ["Width (in)", widthIn, setWidthIn],
                ["Height (in)", heightIn, setHeightIn],
              ] as [string, string, (v: string) => void][]
            ).map(([lbl, val, setter]) => (
              <label key={lbl} className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{lbl}</span>
                <input
                  type="number" min="0.1" step="0.1"
                  value={val}
                  onChange={(e) => { setter(e.target.value); setActivePreset(""); }}
                  className="w-full rounded-lg border border-white/[0.12] bg-zinc-900 px-2.5 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/30"
                />
              </label>
            ))}
          </div>
          <LabelSizePicker className="mt-4" value={labelFormat} onChange={setLabelFormat} />
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowParcelModal(false)}
              className="rounded-lg border border-white/[0.1] px-4 py-2 text-[12px] font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!parcelValid}
              onClick={() => {
                setShowParcelModal(false);
                onCreateLabel(order.id, parsedParcel, labelFormat);
              }}
              className="rounded-lg border border-sky-400/40 bg-sky-500/20 px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-sky-50 transition hover:bg-sky-500/30 disabled:opacity-40"
            >
              Create {labelFormat === "thermal_4x6" ? "4×6" : "letter"} label
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

function BundleShipCard({
  session,
  bundledBusySessionId,
  bundledSessionFeedback,
  onCreateBundledLabel,
  onMarkBundleShipped,
}: {
  session: SellerLiveShippingSessionRow;
  bundledBusySessionId: string | null;
  bundledSessionFeedback?: BundledFeedback;
  onCreateBundledLabel: (
    sessionId: string,
    manualParcel?: ManualParcel,
    labelFormat?: "letter" | "thermal_4x6",
    selectedRateObjectId?: string,
  ) => void;
  onMarkBundleShipped?: (session: SellerLiveShippingSessionRow) => void;
}) {
  const [showParcelModal, setShowParcelModal] = useState(false);
  const [activePreset, setActivePreset] = useState("Card mailer");
  const [labelFormat, setLabelFormat] = useState<SellerLabelPrintFormat>("thermal_4x6");
  const [weightOz, setWeightOz] = useState("4");
  const [lengthIn, setLengthIn] = useState("6");
  const [widthIn, setWidthIn] = useState("4");
  const [heightIn, setHeightIn] = useState("1");
  const [rateBusy, setRateBusy] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rates, setRates] = useState<
    { objectId: string; amountCents: number; carrier: string; service: string; estimatedDays: number | null }[]
  >([]);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [chargedCents, setChargedCents] = useState(0);
  const rateReqId = useRef(0);

  const applyPreset = (p: (typeof PARCEL_PRESETS)[number]) => {
    setWeightOz(String(p.weightOz));
    setLengthIn(String(p.lengthIn));
    setWidthIn(String(p.widthIn));
    setHeightIn(String(p.heightIn));
    setActivePreset(p.label);
  };

  const parsedParcel = {
    weightOz: parseFloat(weightOz),
    lengthIn: parseFloat(lengthIn),
    widthIn: parseFloat(widthIn),
    heightIn: parseFloat(heightIn),
  };
  const parcelValid = Object.values(parsedParcel).every((v) => Number.isFinite(v) && v > 0);

  useEffect(() => {
    if (!showParcelModal || !parcelValid) {
      setRates([]);
      setSelectedRateId(null);
      setRateError(null);
      setRateBusy(false);
      return;
    }
    const reqId = ++rateReqId.current;
    setRateBusy(true);
    setRateError(null);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/account/live-shipping/${encodeURIComponent(session.sessionId)}/preview-rates`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(parsedParcel),
            },
          );
          const j = (await res.json().catch(() => ({}))) as {
            error?: string;
            rates?: {
              objectId: string;
              amountCents: number;
              carrier: string;
              service: string;
              estimatedDays: number | null;
            }[];
            shippingChargedCents?: number;
          };
          if (rateReqId.current !== reqId) return;
          if (!res.ok) {
            setRates([]);
            setSelectedRateId(null);
            setRateError(j.error ?? "Could not quote USPS/UPS rates.");
            return;
          }
          const nextRates = Array.isArray(j.rates) ? j.rates.filter((r) => r.objectId) : [];
          setRates(nextRates);
          setSelectedRateId(nextRates[0]?.objectId ?? null);
          if (typeof j.shippingChargedCents === "number") setChargedCents(j.shippingChargedCents);
          setRateError(null);
        } catch {
          if (rateReqId.current !== reqId) return;
          setRates([]);
          setSelectedRateId(null);
          setRateError("Network error — could not quote rates.");
        } finally {
          if (rateReqId.current === reqId) setRateBusy(false);
        }
      })();
    }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quote when dims change
  }, [showParcelModal, weightOz, lengthIn, widthIn, heightIn, parcelValid, session.sessionId]);

  const buyer = session.buyer.name?.trim()
    ? `${session.buyer.name} (@${session.buyer.username})`
    : `@${session.buyer.username}`;
  const busy = bundledBusySessionId === session.sessionId;
  const labelUrl = session.bundledLabel?.labelUrl;
  const selectedRate = rates.find((r) => r.objectId === selectedRateId) ?? rates[0] ?? null;
  const marginCents = selectedRate ? chargedCents - selectedRate.amountCents : null;

  return (
    <>
    <article className="rounded-xl border border-white/[0.08] bg-[#0a0a0d] p-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#a1a1aa" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="7" width="14" height="12" rx="2" />
              <rect x="7" y="3" width="14" height="12" rx="2" />
            </svg>
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Live show bundle</p>
            <p className="mt-0.5 text-base font-semibold text-zinc-100">{session.liveShowTitle}</p>
            <p className="mt-1 text-sm text-zinc-400">
              {buyer} · {session.orderCount} order{session.orderCount === 1 ? "" : "s"} · {session.itemCount} item
              {session.itemCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.canCreateBundledLabel ? (
            <PrimaryButton tone="gold" disabled={busy} onClick={() => setShowParcelModal(true)}>
              {busy ? "Creating…" : "Create label"}
            </PrimaryButton>
          ) : null}
          {session.canCreateBundledLabel && onMarkBundleShipped ? (
            <PrimaryButton tone="muted" disabled={busy} onClick={() => onMarkBundleShipped(session)}>
              Ship it yourself
            </PrimaryButton>
          ) : null}
          {labelUrl ? (
            <PrimaryButton tone="gold" onClick={() => openLabelForPrint(labelUrl)}>
              Print
            </PrimaryButton>
          ) : null}
        </div>
      </div>
      {session.bundledLabel?.trackingNumber ? (
        <p className="mt-3 font-mono text-xs text-zinc-400">Tracking {session.bundledLabel.trackingNumber}</p>
      ) : null}
      {bundledSessionFeedback ? (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            bundledSessionFeedback.tone === "error"
              ? "border-rose-500/35 bg-rose-950/35 text-rose-100"
              : bundledSessionFeedback.tone === "warning"
                ? "border-amber-500/35 bg-amber-950/30 text-amber-100"
                : "border-emerald-500/35 bg-emerald-950/25 text-emerald-100"
          }`}
        >
          {bundledSessionFeedback.message}
        </p>
      ) : null}
      {!session.bundled ? (
        <p className="mt-2 text-xs text-amber-200/90">Ship-alone session — create a label on each order below.</p>
      ) : null}
    </article>

    {showParcelModal ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) setShowParcelModal(false); }}
      >
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#0e0e12] p-5 shadow-2xl">
          <h2 className="text-base font-bold text-zinc-100">Confirm package details</h2>
          <p className="mt-1 text-[11px] text-zinc-400">
            Adjust the package, then pick a USPS or UPS rate before creating the label.
          </p>
          <div className="mt-3 rounded-lg border border-zinc-700/50 bg-zinc-900/60 px-3 py-2 text-[11px] text-zinc-400">
            <span className="font-semibold text-zinc-300">{session.liveShowTitle}</span>
            {" · "}
            {buyer}
            {" · "}
            {session.orderCount} order{session.orderCount === 1 ? "" : "s"}
            {" · "}
            <span className="font-mono text-zinc-500">System est: {session.pricingWeightOz.toFixed(1)} oz</span>
          </div>

          <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Package type</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {PARCEL_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={`rounded-lg border px-2.5 py-2 text-left transition ${
                  activePreset === p.label
                    ? "border-sky-400/60 bg-sky-500/15 text-sky-50"
                    : "border-white/[0.08] bg-zinc-900/60 text-zinc-300 hover:border-white/20 hover:bg-zinc-800/60"
                }`}
              >
                <p className="text-[11px] font-semibold leading-tight">{p.label}</p>
                <p className="mt-0.5 text-[10px] leading-tight text-zinc-400 line-clamp-2">{p.description}</p>
                <p className="mt-1 font-mono text-[10px] text-zinc-500">
                  {p.weightOz} oz · {p.lengthIn}×{p.widthIn}×{p.heightIn}&quot;
                </p>
              </button>
            ))}
          </div>

          <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Adjust if needed</p>
          <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Weight (oz)", weightOz, setWeightOz],
                ["Length (in)", lengthIn, setLengthIn],
                ["Width (in)", widthIn, setWidthIn],
                ["Height (in)", heightIn, setHeightIn],
              ] as [string, string, (v: string) => void][]
            ).map(([lbl, val, setter]) => (
              <label key={lbl} className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{lbl}</span>
                <input
                  type="number" min="0.1" step="0.1"
                  value={val}
                  onChange={(e) => { setter(e.target.value); setActivePreset(""); }}
                  className="w-full rounded-lg border border-white/[0.12] bg-zinc-900 px-2.5 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/30"
                />
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-zinc-600">L × W × H — measure the outside of the box or mailer</p>

          <LabelSizePicker className="mt-4" value={labelFormat} onChange={setLabelFormat} />

          <div className="mt-4 rounded-lg border border-white/[0.08] bg-zinc-950/80 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">USPS &amp; UPS rates</p>
            {rateBusy ? (
              <p className="mt-1.5 text-[12px] text-zinc-400">Getting Shippo rates…</p>
            ) : rateError ? (
              <p className="mt-1.5 text-[12px] text-rose-200">{rateError}</p>
            ) : rates.length > 0 ? (
              <>
                <ul className="mt-2 space-y-1.5">
                  {rates.map((r) => {
                    const selected = r.objectId === selectedRate?.objectId;
                    return (
                      <li key={r.objectId}>
                        <button
                          type="button"
                          onClick={() => setSelectedRateId(r.objectId)}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                            selected
                              ? "border-sky-400/50 bg-sky-500/15"
                              : "border-white/[0.08] bg-zinc-900/50 hover:border-white/20"
                          }`}
                        >
                          <span className="text-[11px] text-zinc-300">
                            <span className="font-semibold text-zinc-100">{r.carrier}</span> {r.service}
                            {r.estimatedDays != null ? ` · ~${r.estimatedDays}d` : ""}
                          </span>
                          <span className="font-mono text-[11px] text-zinc-100">
                            {(r.amountCents / 100).toLocaleString("en-US", {
                              style: "currency",
                              currency: "USD",
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {chargedCents > 0 && selectedRate ? (
                  <p className="mt-2 text-[11px] text-zinc-400">
                    Buyer paid{" "}
                    {(chargedCents / 100).toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 2,
                    })}
                    {marginCents != null ? (
                      <>
                        {" · "}
                        <span className={marginCents < 0 ? "font-semibold text-rose-300" : "font-semibold text-emerald-300"}>
                          {(marginCents / 100).toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                            maximumFractionDigits: 2,
                          })}{" "}
                          margin
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-1.5 text-[12px] text-zinc-500">Enter package details to see USPS and UPS rates.</p>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowParcelModal(false)}
              className="rounded-lg border border-white/[0.1] px-4 py-2 text-[12px] font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!parcelValid || rateBusy || !selectedRate}
              onClick={() => {
                setShowParcelModal(false);
                onCreateBundledLabel(session.sessionId, parsedParcel, labelFormat, selectedRate?.objectId);
              }}
              className="rounded-lg border border-sky-400/40 bg-sky-500/20 px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-sky-50 transition hover:bg-sky-500/30 disabled:opacity-40"
            >
              {selectedRate
                ? `Create ${labelFormat === "thermal_4x6" ? "4×6" : "letter"} · ${(selectedRate.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}`
                : `Create ${labelFormat === "thermal_4x6" ? "4×6" : "letter"} label`}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

type PrimaryTab = "needs_label" | "pending_shipment" | "shipped" | "complete";

const PRIMARY_TABS: PrimaryTab[] = ["needs_label", "pending_shipment", "shipped", "complete"];

/**
 * Which queue tab a given order phase renders in. "print_and_ship" (label
 * exists, seller still needs to print + drop off) is grouped with Needs
 * label -- it's still a to-do -- so this is the single source of truth for
 * phase -> tab, used both for bucketing and for the "moved to X" toast.
 */
function tabForShipQueuePhase(phase: SellerShipQueuePhase): PrimaryTab | null {
  if (phase === "needs_label" || phase === "print_and_ship") return "needs_label";
  if (phase === "awaiting_carrier") return "pending_shipment";
  if (phase === "in_transit") return "shipped";
  if (phase === "done") return "complete";
  return null;
}

const TAB_META: Record<PrimaryTab, { label: string; hint: string; emptyHint: string }> = {
  needs_label: {
    label: "Needs label",
    hint: "Create a label, then print it and drop off the package.",
    emptyHint: "Nothing needs a label or drop-off right now.",
  },
  pending_shipment: {
    label: "Pending shipment",
    hint: "Dropped off — nothing to do here. Moves to Shipped automatically once the carrier scans it in.",
    emptyHint: "Nothing waiting on a carrier scan.",
  },
  shipped: {
    label: "Shipped",
    hint: "Carrier has scanned the package — in transit to the buyer.",
    emptyHint: "Nothing in transit right now.",
  },
  complete: {
    label: "Complete",
    hint: "Delivered to the buyer.",
    emptyHint: "Nothing delivered yet.",
  },
};

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2.5 text-[13px] font-bold transition ${
        active ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
      <span
        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums ${
          active ? "bg-gold/20 text-gold-bright" : "bg-white/[0.06] text-zinc-500"
        }`}
      >
        {count}
      </span>
      {active ? <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gold" aria-hidden /> : null}
    </button>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.08] px-6 py-10 text-center text-sm text-zinc-600">
      {message}
    </div>
  );
}

export function AccountSellerShipWorkspace({
  orders,
  liveShipping,
  labelBusyId,
  bundledBusySessionId,
  bundledSessionFeedback,
  labelError,
  onCreateLabel,
  onCreateBundledLabel,
  onMarkShipped,
  onMarkBundleShipped,
}: Props) {
  const [showWaitPayment, setShowWaitPayment] = useState(false);
  const [activeTab, setActiveTab] = useState<PrimaryTab | null>(null);
  const [toast, setToast] = useState<{ tab: PrimaryTab; message: string } | null>(null);
  const prevPhaseRef = useRef<Map<string, SellerShipQueuePhase> | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const awaitingBundleIds = useMemo(
    () => orderIdsAwaitingBundledLabel(liveShipping?.sessions ?? []),
    [liveShipping],
  );

  const buckets = useMemo(() => {
    const needsLabel: Array<{ order: ShipWorkspaceOrder; phase: "needs_label" | "print_and_ship" }> = [];
    const pendingShipment: Array<{ order: ShipWorkspaceOrder; phase: "awaiting_carrier" }> = [];
    const shipped: ShipWorkspaceOrder[] = [];
    const complete: ShipWorkspaceOrder[] = [];
    const waitPayment: ShipWorkspaceOrder[] = [];

    for (const order of orders) {
      if (!sellerShipQueueEligible(order)) continue;
      const phase = sellerShipQueuePhase(order);
      if (phase === "needs_label") {
        if (!awaitingBundleIds.has(order.id)) needsLabel.push({ order, phase });
      } else if (phase === "print_and_ship") {
        needsLabel.push({ order, phase });
      } else if (phase === "awaiting_carrier") {
        pendingShipment.push({ order, phase });
      } else if (phase === "in_transit") {
        shipped.push(order);
      } else if (phase === "done") {
        complete.push(order);
      } else if (phase === "wait_payment") {
        waitPayment.push(order);
      }
    }

    // Keep complete list tidy — newest first, cap display set.
    complete.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return { needsLabel, pendingShipment, shipped, complete: complete.slice(0, 40), waitPayment };
  }, [orders, awaitingBundleIds]);

  // Seller ask (Sept 2026): the Needs Label tab was one flat pile of tiles - hard to tell what
  // sold on which day at a glance, even with a date printed inside each tile. Group into
  // same-day sections (newest day first) with a heading, same pattern a seller already expects
  // from any order-history list.
  const needsLabelByDay = useMemo(() => {
    const sorted = [...buckets.needsLabel].sort(
      (a, b) => Date.parse(b.order.createdAt) - Date.parse(a.order.createdAt),
    );
    const groups: {
      key: string;
      heading: string;
      entries: { order: ShipWorkspaceOrder; phase: "needs_label" | "print_and_ship" }[];
    }[] = [];
    const indexByKey = new Map<string, number>();
    for (const entry of sorted) {
      const key = orderDayKey(entry.order.createdAt);
      let idx = indexByKey.get(key);
      if (idx === undefined) {
        idx = groups.length;
        indexByKey.set(key, idx);
        groups.push({ key, heading: formatDateHeading(entry.order.createdAt), entries: [] });
      }
      groups[idx].entries.push(entry);
    }
    return groups;
  }, [buckets.needsLabel]);

  const createBundles = useMemo(
    () => (liveShipping?.sessions ?? []).filter((s) => s.canCreateBundledLabel),
    [liveShipping],
  );
  const printBundles = useMemo(
    () =>
      (liveShipping?.sessions ?? []).filter(
        (s) =>
          Boolean(s.bundledLabel?.labelUrl) &&
          !s.canCreateBundledLabel &&
          // Regression guard: a session whose orders have ALL already been marked shipped also
          // has canCreateBundledLabel: false (nothing left to label) — without this check its
          // card would sit in Needs label forever even after every order in it has shipped,
          // since the individual orders move on to their own Shipped/Complete ShipOrderCards but
          // this session-level card never noticed. Keep it here only while at least one order in
          // the bundle is still pending/paid — i.e. labeled, but not yet marked shipped.
          s.orders.some((o) => o.orderStatus === "pending" || o.orderStatus === "paid"),
      ),
    [liveShipping],
  );

  const actionCounts = countShipQueueActions(orders, { skipOrderIds: awaitingBundleIds });
  const needsLabelCount = buckets.needsLabel.length + createBundles.length + printBundles.length;
  const pendingShipmentCount = buckets.pendingShipment.length;
  const activeCount = needsLabelCount + pendingShipmentCount;

  const tabCounts: Record<PrimaryTab, number> = {
    needs_label: needsLabelCount,
    pending_shipment: pendingShipmentCount,
    shipped: buckets.shipped.length,
    complete: actionCounts.complete,
  };

  // Surface a quiet toast — rather than yanking the seller to a new tab — whenever an order's
  // phase actually settles into a new stage server-side (label created, marked shipped,
  // delivered). This is diffed off the real data, not the button click, so cancelling a
  // "mark shipped" confirmation modal never fires a false "moved" notice, and a seller working
  // through several orders in a row on one tab is never involuntarily switched away mid-task.
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const next = new Map<string, SellerShipQueuePhase>();
    const moved: Record<Exclude<PrimaryTab, "needs_label">, number> = {
      pending_shipment: 0,
      shipped: 0,
      complete: 0,
    };

    for (const order of orders) {
      if (!sellerShipQueueEligible(order)) continue;
      const phase = sellerShipQueuePhase(order);
      next.set(order.id, phase);
      const prevPhase = prev?.get(order.id);
      if (prev && prevPhase && prevPhase !== phase) {
        const prevTab = tabForShipQueuePhase(prevPhase);
        const nextTab = tabForShipQueuePhase(phase);
        if (nextTab && nextTab !== prevTab) {
          if (nextTab === "pending_shipment") moved.pending_shipment += 1;
          else if (nextTab === "shipped") moved.shipped += 1;
          else if (nextTab === "complete") moved.complete += 1;
        }
      }
    }
    prevPhaseRef.current = next;

    const destination = (["pending_shipment", "shipped", "complete"] as const).find((t) => moved[t] > 0);
    if (destination) {
      const n = moved[destination];
      if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
      setToast({ tab: destination, message: `${n} order${n === 1 ? "" : "s"} moved to ${TAB_META[destination].label}.` });
      toastTimerRef.current = window.setTimeout(() => setToast(null), 6000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- diff against previous orders snapshot only
  }, [orders]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  if (
    activeCount === 0 &&
    buckets.waitPayment.length === 0 &&
    buckets.shipped.length === 0 &&
    buckets.complete.length === 0
  ) {
    return (
      <div className="mt-8 space-y-4">
        <SetupBanner liveShipping={liveShipping} />
        <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-14 text-center">
          <p className="font-display text-xl font-semibold text-foreground">Nothing to ship right now</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            When a buyer pays, packages move through: Needs label → Pending shipment → Shipped → Complete.
          </p>
          <Link
            href="/account/sales?view=all"
            className="mt-6 inline-flex text-sm font-semibold text-gold-bright hover:underline"
          >
            View sales history →
          </Link>
        </div>
      </div>
    );
  }

  const currentTab: PrimaryTab = activeTab ?? PRIMARY_TABS.find((t) => tabCounts[t] > 0) ?? "needs_label";

  return (
    <div className="mt-6 space-y-4">
      <SetupBanner liveShipping={liveShipping} />

      {labelError ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{labelError}</p>
      ) : null}

      <div className="sticky top-0 z-10 -mx-1 bg-[#030303]/95 px-1 pb-3 pt-1 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0a0a0d]/70 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PRIMARY_TABS.map((tab) => (
            <TabButton
              key={tab}
              label={TAB_META[tab].label}
              count={tabCounts[tab]}
              active={currentTab === tab}
              onClick={() => setActiveTab(tab)}
            />
          ))}
        </div>
      </div>

      {toast ? (
        <button
          type="button"
          onClick={() => {
            setActiveTab(toast.tab);
            setToast(null);
          }}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold/[0.07] px-4 py-2.5 text-left text-sm text-zinc-200 transition hover:border-gold/40"
        >
          <span>{toast.message}</span>
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-gold-bright">View →</span>
        </button>
      ) : null}

      {buckets.waitPayment.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowWaitPayment((v) => !v)}
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-600 hover:text-zinc-400"
        >
          {buckets.waitPayment.length} order{buckets.waitPayment.length === 1 ? "" : "s"} waiting on payment{" "}
          {showWaitPayment ? "▾" : "▸"}
        </button>
      ) : null}
      {showWaitPayment && buckets.waitPayment.length > 0 ? (
        <div className="space-y-2.5">
          {buckets.waitPayment.map((order) => (
            <ShipOrderCard
              key={order.id}
              order={order}
              labelBusyId={labelBusyId}
              phase="wait_payment"
              onCreateLabel={onCreateLabel}
              onMarkShipped={onMarkShipped}
            />
          ))}
        </div>
      ) : null}

      <p className="text-xs text-zinc-600">{TAB_META[currentTab].hint}</p>

      <div className="space-y-2.5">
        {currentTab === "needs_label" ? (
          tabCounts.needs_label > 0 ? (
            <>
              {createBundles.map((session) => (
                <BundleShipCard
                  key={session.sessionId}
                  session={session}
                  bundledBusySessionId={bundledBusySessionId}
                  bundledSessionFeedback={bundledSessionFeedback?.[session.sessionId]}
                  onCreateBundledLabel={onCreateBundledLabel}
                  onMarkBundleShipped={onMarkBundleShipped}
                />
              ))}
              {printBundles.map((session) => (
                <BundleShipCard
                  key={session.sessionId}
                  session={session}
                  bundledBusySessionId={bundledBusySessionId}
                  bundledSessionFeedback={bundledSessionFeedback?.[session.sessionId]}
                  onCreateBundledLabel={onCreateBundledLabel}
                />
              ))}
              {needsLabelByDay.map((group) => (
                <div key={group.key} className="space-y-2.5">
                  <div className="flex items-center gap-2 pt-1 first:pt-0">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                      {group.heading}
                    </span>
                    <span className="text-[11px] text-zinc-700">
                      · {group.entries.length} order{group.entries.length === 1 ? "" : "s"}
                    </span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>
                  {group.entries.map(({ order, phase }) => (
                    <ShipOrderCard
                      key={order.id}
                      order={order}
                      labelBusyId={labelBusyId}
                      phase={phase}
                      onCreateLabel={onCreateLabel}
                      onMarkShipped={onMarkShipped}
                    />
                  ))}
                </div>
              ))}
            </>
          ) : (
            <EmptyTab message={TAB_META.needs_label.emptyHint} />
          )
        ) : null}

        {currentTab === "pending_shipment" ? (
          tabCounts.pending_shipment > 0 ? (
            <>
              {buckets.pendingShipment.map(({ order, phase }) => (
                <ShipOrderCard
                  key={order.id}
                  order={order}
                  labelBusyId={labelBusyId}
                  phase={phase}
                  onCreateLabel={onCreateLabel}
                  onMarkShipped={onMarkShipped}
                />
              ))}
            </>
          ) : (
            <EmptyTab message={TAB_META.pending_shipment.emptyHint} />
          )
        ) : null}

        {currentTab === "shipped" ? (
          buckets.shipped.length > 0 ? (
            buckets.shipped.map((order) => (
              <ShipOrderCard
                key={order.id}
                order={order}
                labelBusyId={labelBusyId}
                phase="in_transit"
                onCreateLabel={onCreateLabel}
                onMarkShipped={onMarkShipped}
              />
            ))
          ) : (
            <EmptyTab message={TAB_META.shipped.emptyHint} />
          )
        ) : null}

        {currentTab === "complete" ? (
          buckets.complete.length > 0 ? (
            <>
              {buckets.complete.map((order) => (
                <ShipOrderCard
                  key={order.id}
                  order={order}
                  labelBusyId={labelBusyId}
                  phase="done"
                  onCreateLabel={onCreateLabel}
                  onMarkShipped={onMarkShipped}
                />
              ))}
              <Link
                href="/account/sales?view=all"
                className="inline-flex text-sm font-semibold text-gold-bright hover:underline"
              >
                View full sales history →
              </Link>
            </>
          ) : (
            <EmptyTab message={TAB_META.complete.emptyHint} />
          )
        ) : null}
      </div>
    </div>
  );
}
