"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type {
  SellerLiveShippingDashboard,
  SellerLiveShippingSessionRow,
} from "@/lib/seller-live-shipping-dashboard-types";
import {
  openLabelForPrint,
  type SellerLabelPrintFormat,
} from "@/lib/seller-shipping-label-state";
import { storeLabelPrintFormat } from "@/lib/shippo-label-format";

type ManualParcel = { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };

const PARCEL_PRESETS: Array<{
  label: string;
  description: string;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}> = [
  {
    label: "Card mailer",
    description: "PWE / bubble mailer, a few cards",
    weightOz: 4,
    lengthIn: 6,
    widthIn: 4,
    heightIn: 1,
  },
  {
    label: "Padded mailer",
    description: "Bubble mailer, stack of cards or small items",
    weightOz: 8,
    lengthIn: 9,
    widthIn: 6,
    heightIn: 1,
  },
  {
    label: "Small box",
    description: "Graded slab, loose packs, multiple cards",
    weightOz: 16,
    lengthIn: 10,
    widthIn: 7,
    heightIn: 3,
  },
  {
    label: "Medium box",
    description: "Large haul, mix of items from a break",
    weightOz: 32,
    lengthIn: 12,
    widthIn: 9,
    heightIn: 5,
  },
  {
    label: "Mini helmet",
    description: "Mini collectible helmet (~1.5 lbs)",
    weightOz: 24,
    lengthIn: 11,
    widthIn: 8,
    heightIn: 7,
  },
  {
    label: "Full-size helmet",
    description: "Full NFL / MLB helmet (~5 lbs)",
    weightOz: 80,
    lengthIn: 14,
    widthIn: 12,
    heightIn: 12,
  },
];

function LabelParcelModal({
  contextLine,
  sessionId,
  shippingChargedCents,
  onConfirm,
  onCancel,
}: {
  contextLine: string;
  sessionId?: string;
  shippingChargedCents?: number;
  onConfirm: (parcel: ManualParcel, labelFormat: SellerLabelPrintFormat) => void;
  onCancel: () => void;
}) {
  const [weightOz, setWeightOz] = useState("4");
  const [lengthIn, setLengthIn] = useState("6");
  const [widthIn, setWidthIn] = useState("4");
  const [heightIn, setHeightIn] = useState("1");
  const [activePreset, setActivePreset] = useState<string>("Card mailer");
  const [labelFormat, setLabelFormat] = useState<SellerLabelPrintFormat>("thermal_4x6");
  const [rateBusy, setRateBusy] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rates, setRates] = useState<
    { amountCents: number; carrier: string; service: string; estimatedDays: number | null }[]
  >([]);
  const [cheapestCents, setCheapestCents] = useState<number | null>(null);
  const [chargedCents, setChargedCents] = useState(shippingChargedCents ?? 0);
  const firstRef = useRef<HTMLInputElement>(null);
  const rateReqId = useRef(0);

  useEffect(() => {
    firstRef.current?.focus();
    firstRef.current?.select();
  }, []);

  const applyPreset = (p: (typeof PARCEL_PRESETS)[number]) => {
    setWeightOz(String(p.weightOz));
    setLengthIn(String(p.lengthIn));
    setWidthIn(String(p.widthIn));
    setHeightIn(String(p.heightIn));
    setActivePreset(p.label);
  };

  const parsed = {
    weightOz: parseFloat(weightOz),
    lengthIn: parseFloat(lengthIn),
    widthIn: parseFloat(widthIn),
    heightIn: parseFloat(heightIn),
  };
  const valid = Object.values(parsed).every((v) => Number.isFinite(v) && v > 0);

  useEffect(() => {
    if (!sessionId || !valid) {
      setRates([]);
      setCheapestCents(null);
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
            `/api/account/live-shipping/${encodeURIComponent(sessionId)}/preview-rates`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(parsed),
            },
          );
          const j = (await res.json().catch(() => ({}))) as {
            error?: string;
            rates?: { amountCents: number; carrier: string; service: string; estimatedDays: number | null }[];
            cheapestCents?: number | null;
            shippingChargedCents?: number;
          };
          if (rateReqId.current !== reqId) return;
          if (!res.ok) {
            setRates([]);
            setCheapestCents(null);
            setRateError(j.error ?? "Could not quote rates.");
            return;
          }
          setRates(Array.isArray(j.rates) ? j.rates : []);
          setCheapestCents(typeof j.cheapestCents === "number" ? j.cheapestCents : null);
          if (typeof j.shippingChargedCents === "number") setChargedCents(j.shippingChargedCents);
          setRateError(null);
        } catch {
          if (rateReqId.current !== reqId) return;
          setRates([]);
          setCheapestCents(null);
          setRateError("Network error — could not quote rates.");
        } finally {
          if (rateReqId.current === reqId) setRateBusy(false);
        }
      })();
    }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quote when dims change
  }, [sessionId, weightOz, lengthIn, widthIn, heightIn, valid]);

  const marginCents = cheapestCents != null ? chargedCents - cheapestCents : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#0e0e12] p-5 shadow-2xl">
        <h2 className="text-base font-bold text-zinc-100">Confirm package details</h2>
        <p className="mt-1 text-[11px] text-zinc-400">
          Select the package type that matches what you&apos;re actually shipping, then check the estimated label cost before creating.
        </p>

        <div className="mt-3 rounded-lg border border-zinc-700/50 bg-zinc-900/60 px-3 py-2 text-[11px] text-zinc-400">
          {contextLine}
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
              ["Weight (oz)", weightOz, setWeightOz, firstRef],
              ["Length (in)", lengthIn, setLengthIn, null],
              ["Width (in)", widthIn, setWidthIn, null],
              ["Height (in)", heightIn, setHeightIn, null],
            ] as [string, string, (v: string) => void, React.RefObject<HTMLInputElement> | null][]
          ).map(([lbl, val, setter, ref]) => (
            <label key={lbl} className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{lbl}</span>
              <input
                ref={ref ?? undefined}
                type="number"
                min="0.1"
                step="0.1"
                value={val}
                onChange={(e) => {
                  setter(e.target.value);
                  setActivePreset("");
                }}
                className="w-full rounded-lg border border-white/[0.12] bg-zinc-900 px-2.5 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/30"
              />
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-600">L × W × H — measure the outside of the box or mailer</p>

        <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Label size</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {(
            [
              ["thermal_4x6", "4×6 thermal", "For thermal label printers"],
              ["letter", "Letter (8.5×11)", "For regular home/office printers"],
            ] as const
          ).map(([value, title, hint]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setLabelFormat(value);
                storeLabelPrintFormat(value);
              }}
              className={`rounded-lg border px-2.5 py-2 text-left transition ${
                labelFormat === value
                  ? "border-amber-400/55 bg-amber-500/15 text-amber-50"
                  : "border-white/[0.08] bg-zinc-900/60 text-zinc-300 hover:border-white/20 hover:bg-zinc-800/60"
              }`}
            >
              <p className="text-[11px] font-semibold leading-tight">{title}</p>
              <p className="mt-0.5 text-[10px] leading-tight text-zinc-400">{hint}</p>
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-white/[0.08] bg-zinc-950/80 px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Estimated label cost</p>
          {!sessionId ? (
            <p className="mt-1.5 text-[12px] text-zinc-500">
              Rate preview is available when creating a bundled label for the whole session.
            </p>
          ) : rateBusy ? (
            <p className="mt-1.5 text-[12px] text-zinc-400">Getting Shippo rates…</p>
          ) : rateError ? (
            <p className="mt-1.5 text-[12px] text-rose-200">{rateError}</p>
          ) : cheapestCents != null ? (
            <>
              <p className="mt-1 font-mono text-lg font-semibold text-sky-100">
                {formatMoneyCents(cheapestCents)}
                <span className="ml-2 text-[11px] font-normal text-zinc-500">cheapest USPS/UPS</span>
              </p>
              <p className="mt-1 text-[11px] text-zinc-400">
                Buyer paid {formatMoneyCents(chargedCents)} for shipping
                {marginCents != null ? (
                  <>
                    {" · "}
                    <span className={marginCents < 0 ? "font-semibold text-rose-300" : "font-semibold text-emerald-300"}>
                      {formatMoneyCents(marginCents)} margin
                    </span>
                  </>
                ) : null}
              </p>
              {rates.length > 1 ? (
                <ul className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">
                  {rates.map((r, i) => (
                    <li key={`${r.carrier}-${r.service}-${i}`} className="flex justify-between gap-2 text-[11px]">
                      <span className="text-zinc-400">
                        {r.carrier} {r.service}
                        {r.estimatedDays != null ? ` · ~${r.estimatedDays}d` : ""}
                      </span>
                      <span className="font-mono text-zinc-200">{formatMoneyCents(r.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="mt-1.5 text-[12px] text-zinc-500">Enter package details to see rates.</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/[0.1] px-4 py-2 text-[12px] font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || rateBusy}
            onClick={() => valid && onConfirm(parsed, labelFormat)}
            className="rounded-lg border border-sky-400/40 bg-sky-500/20 px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-sky-50 transition hover:bg-sky-500/30 disabled:opacity-40"
          >
            {cheapestCents != null
              ? `Create ${labelFormat === "thermal_4x6" ? "4×6" : "letter"} · ${formatMoneyCents(cheapestCents)}`
              : `Create ${labelFormat === "thermal_4x6" ? "4×6" : "letter"} label`}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatMoneyCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatMoneyUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function labelStatusLabel(st: SellerLiveShippingSessionRow["labelStatus"]): string {
  switch (st) {
    case "complete":
      return "Labels complete";
    case "partial":
      return "Labels partial";
    case "labels_needed":
      return "Labels needed";
    case "awaiting_payment":
      return "Awaiting buyer payment";
    default:
      return "—";
  }
}

function SessionCard({
  s,
  expanded,
  onToggle,
  labelBusyId,
  bundledBusySessionId,
  bundledSessionFeedback,
  orderLabelFeedback,
  onRequestBundledLabel,
  onRequestOrderLabel,
}: {
  s: SellerLiveShippingSessionRow;
  expanded: boolean;
  onToggle: () => void;
  labelBusyId: string | null;
  bundledBusySessionId: string | null;
  bundledSessionFeedback?: { tone: "error" | "success" | "warning"; message: string };
  orderLabelFeedback?: Record<string, { tone: "error" | "success" | "warning"; message: string }>;
  onRequestBundledLabel: (session: SellerLiveShippingSessionRow) => void;
  onRequestOrderLabel: (session: SellerLiveShippingSessionRow, orderId: string) => void;
}) {
  const buyerDisplay = s.buyer.name?.trim() ? `${s.buyer.name} (@${s.buyer.username})` : `@${s.buyer.username}`;
  const canShowPerOrderLabelCta =
    !s.canCreateBundledLabel && s.ordersNeedingLabels.length > 0 && s.labelStatus !== "awaiting_payment";

  return (
    <article className="rounded-xl border border-white/[0.08] bg-black/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Live show</p>
          <p className="mt-0.5 font-semibold text-zinc-100">{s.liveShowTitle}</p>
          <p className="mt-1 text-xs text-zinc-400">
            Buyer {buyerDisplay} · {s.orderCount} order{s.orderCount === 1 ? "" : "s"} · {s.itemCount} line item
            {s.itemCount === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            <Link href={`/live/${encodeURIComponent(s.liveShowId)}`} className="text-gold-bright/90 hover:underline">
              Open room
            </Link>
            <span className="mx-2 text-zinc-600">·</span>
            Room {s.liveShowStatus}
            {!s.bundled ? (
              <>
                <span className="mx-2 text-zinc-600">·</span>
                <span className="text-amber-200/90">Ship-alone session</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="text-right text-xs">
          <p className="font-mono font-semibold text-emerald-200/95">{formatMoneyCents(s.shippingChargedCents)} charged</p>
          <p className="mt-0.5 font-mono text-zinc-400">{formatMoneyCents(s.shippingLabelCostCents)} label cost</p>
          <p className={`mt-0.5 font-mono font-semibold ${s.marginNegative ? "text-rose-300" : "text-gold-bright/90"}`}>
            {formatMoneyCents(s.marginCents)} margin
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">{labelStatusLabel(s.labelStatus)}</p>
        </div>
      </div>
      <dl className="mt-3 grid gap-2 border-t border-white/[0.06] pt-3 text-[11px] text-zinc-400 sm:grid-cols-3">
        <div>
          <dt className="text-zinc-500">Pricing weight</dt>
          <dd className="font-mono text-zinc-200">{s.pricingWeightOz.toFixed(1)} oz</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Session rate (buyer)</dt>
          <dd className="font-mono text-zinc-200">{formatMoneyCents(s.sessionShippingCents)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Cap reached</dt>
          <dd className="text-zinc-200">{s.capReached ? "Yes" : "No"}</dd>
        </div>
      </dl>

      {s.canCreateBundledLabel ? (
        <div className="mt-3 rounded-lg border border-sky-500/25 bg-sky-950/20 px-3 py-2">
          <p className="text-[11px] font-semibold text-sky-100">Bundled Shippo label</p>
          <p className="mt-0.5 text-[10px] text-sky-200/80">
            One label for every paid, non-ship-alone order in this session (real packed weight, not live pricing
            weight).
          </p>
          <button
            type="button"
            disabled={bundledBusySessionId === s.sessionId}
            onClick={() => onRequestBundledLabel(s)}
            className="mt-2 rounded-md border border-sky-400/40 bg-sky-500/20 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-sky-50 transition hover:bg-sky-500/30 disabled:opacity-50"
          >
            {bundledBusySessionId === s.sessionId ? "Creating…" : "Create bundled label"}
          </button>
          {bundledSessionFeedback ? (
            <p
              className={`mt-2 rounded-md border px-2.5 py-2 text-[11px] leading-snug ${
                bundledSessionFeedback.tone === "error"
                  ? "border-rose-500/35 bg-rose-950/35 text-rose-100"
                  : bundledSessionFeedback.tone === "warning"
                    ? "border-amber-500/35 bg-amber-950/30 text-amber-100"
                    : "border-emerald-500/35 bg-emerald-950/25 text-emerald-100"
              }`}
              role="status"
            >
              {bundledSessionFeedback.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {s.bundledLabel?.labelUrl || s.bundledLabel?.trackingNumber ? (
        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-950/15 px-3 py-2 text-[11px] text-emerald-100/95">
          <p className="font-semibold text-emerald-50">Bundle label</p>
          {s.bundledLabel.trackingNumber ? (
            <p className="mt-1 font-mono text-[10px] text-emerald-200/90">Tracking {s.bundledLabel.trackingNumber}</p>
          ) : null}
          {s.bundledLabel.labelUrl ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openLabelForPrint(s.bundledLabel!.labelUrl!, "letter")}
                className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-50 transition hover:bg-emerald-500/25"
              >
                Print letter
              </button>
              <button
                type="button"
                onClick={() => openLabelForPrint(s.bundledLabel!.labelUrl!, "thermal_4x6")}
                className="rounded-md border border-amber-400/40 bg-amber-500/20 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-50 transition hover:bg-amber-500/30"
              >
                Print 4×6
              </button>
              <a
                href={s.bundledLabel.labelUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-zinc-500/35 bg-zinc-800/40 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-200 transition hover:bg-zinc-700/50"
              >
                Open PDF
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {canShowPerOrderLabelCta ? (
        <div className="mt-3 rounded-lg border border-sky-500/25 bg-sky-950/20 px-3 py-2">
          <p className="text-[11px] font-semibold text-sky-100">Create shipping labels (per order)</p>
          <p className="mt-0.5 text-[10px] text-sky-200/80">
            Use when a bundled label is not available (e.g. ship-alone items or mixed fulfillment). Confirm weight and
            dims before creating.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {s.ordersNeedingLabels.map((oid) => {
              const order = s.orders.find((o) => o.id === oid);
              const fb = orderLabelFeedback?.[oid];
              return (
                <div key={oid} className="flex flex-col gap-1">
                  <button
                    type="button"
                    disabled={labelBusyId === oid}
                    onClick={() => onRequestOrderLabel(s, oid)}
                    className="rounded-md border border-sky-400/35 bg-sky-500/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-100 transition hover:bg-sky-500/25 disabled:opacity-50"
                  >
                    {labelBusyId === oid
                      ? "Creating…"
                      : `Label${order?.listingTitle ? `: ${order.listingTitle.slice(0, 28)}` : " order"}`}
                  </button>
                  {fb ? (
                    <p
                      className={`max-w-[220px] rounded-md border px-2 py-1 text-[10px] leading-snug ${
                        fb.tone === "error"
                          ? "border-rose-500/35 bg-rose-950/35 text-rose-100"
                          : fb.tone === "warning"
                            ? "border-amber-500/35 bg-amber-950/30 text-amber-100"
                            : "border-emerald-500/35 bg-emerald-950/25 text-emerald-100"
                      }`}
                    >
                      {fb.message}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        className="mt-3 text-[11px] font-semibold text-gold-bright/90 hover:underline"
        aria-expanded={expanded}
      >
        {expanded ? "Hide" : "Show"} included orders ({s.orders.length})
      </button>

      {expanded ? (
        <ul className="mt-2 space-y-2 border-t border-white/[0.05] pt-2">
          {s.orders.map((o) => (
            <li key={o.id} className="rounded-lg border border-white/[0.05] bg-zinc-950/50 px-3 py-2 text-[11px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-zinc-200">{o.listingTitle}</p>
                <p className="font-mono text-zinc-300">{formatMoneyUsd(o.itemPriceUsd)}</p>
              </div>
              <p className="mt-1 text-[10px] text-zinc-500">
                Ship charged:{" "}
                {o.shippingChargedPortionCents != null ? (
                  <span className="font-mono text-zinc-300">{formatMoneyCents(o.shippingChargedPortionCents)}</span>
                ) : (
                  "—"
                )}
                {o.shippingLabelCostCents != null ? (
                  <>
                    {" "}
                    · Label: <span className="font-mono text-zinc-300">{formatMoneyCents(o.shippingLabelCostCents)}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-0.5 text-[10px] uppercase text-zinc-500">
                Order {o.orderStatus} · Pay {o.paymentStatus} · {o.fulfillmentStatus}
                {o.hasLabel ? " · Label" : ""}
                {o.shipAlone ? " · Ship alone" : ""}
              </p>
              {o.trackingNumber ? (
                <p className="mt-0.5 font-mono text-[10px] text-zinc-400">Tracking {o.trackingNumber}</p>
              ) : null}
              <div className="mt-1.5">
                <Link
                  href={`/orders/${encodeURIComponent(o.id)}`}
                  className="text-[10px] font-semibold text-gold-bright/90 hover:underline"
                >
                  View order →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

type Props = {
  data: SellerLiveShippingDashboard | null;
  loading: boolean;
  labelBusyId: string | null;
  bundledBusySessionId: string | null;
  bundledSessionFeedback?: Record<string, { tone: "error" | "success" | "warning"; message: string }>;
  orderLabelFeedback?: Record<string, { tone: "error" | "success" | "warning"; message: string }>;
  onCreateLabel: (
    orderId: string,
    manualParcel?: ManualParcel,
    labelFormat?: SellerLabelPrintFormat,
  ) => void;
  onCreateBundledLabel: (
    sessionId: string,
    manualParcel?: ManualParcel,
    labelFormat?: SellerLabelPrintFormat,
  ) => void;
};

type ParcelModalState =
  | { kind: "bundled"; session: SellerLiveShippingSessionRow }
  | { kind: "order"; session: SellerLiveShippingSessionRow; orderId: string };

export function AccountLiveShipmentsSection({
  data,
  loading,
  labelBusyId,
  bundledBusySessionId,
  bundledSessionFeedback,
  orderLabelFeedback,
  onCreateLabel,
  onCreateBundledLabel,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [parcelModal, setParcelModal] = useState<ParcelModalState | null>(null);

  const grouped = useMemo(() => {
    if (!data?.sessions.length) return [];
    const byShow = new Map<string, SellerLiveShippingSessionRow[]>();
    for (const s of data.sessions) {
      const list = byShow.get(s.liveShowId) ?? [];
      list.push(s);
      byShow.set(s.liveShowId, list);
    }
    return [...byShow.entries()];
  }, [data]);

  if (loading) {
    return (
      <div className="mt-8 rounded-xl border border-white/[0.08] bg-[#08080a] p-4">
        <p className="text-sm text-zinc-500">Loading live shipments…</p>
      </div>
    );
  }

  if (!data || data.sessions.length === 0) {
    return null;
  }

  return (
    <section className="mt-8 space-y-4">
      <div className="rounded-xl border border-white/[0.08] bg-[#08080a] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Live shipments</p>
            <h2 className="font-display mt-1 text-lg font-bold text-foreground">Live shipping bundles</h2>
            <p className="mt-1 text-xs text-zinc-500">Per buyer, per show — what buyers paid for bundled shipping vs your label spend.</p>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-[10px] font-bold uppercase text-zinc-500">Shipping collected</dt>
            <dd className="mt-0.5 font-mono text-base font-semibold text-emerald-200/95">
              {formatMoneyCents(data.totals.shippingChargedCents)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase text-zinc-500">Label cost (Shippo)</dt>
            <dd className="mt-0.5 font-mono text-base font-semibold text-zinc-200">
              {formatMoneyCents(data.totals.shippingLabelCostCents)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase text-zinc-500">Est. margin</dt>
            <dd
              className={`mt-0.5 font-mono text-base font-semibold ${data.totals.marginNegative ? "text-rose-300" : "text-gold-bright/90"}`}
            >
              {formatMoneyCents(data.totals.marginCents)}
            </dd>
          </div>
        </dl>
        {data.totals.marginNegative ? (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-xs text-rose-100">
            Warning: estimated shipping margin is negative (label spend exceeds what was collected on these orders).
            Review rates and Shippo costs.
          </p>
        ) : null}
        {data.labelSetup &&
        (!data.labelSetup.shippoApiOk || !data.labelSetup.shipFromComplete || !data.labelSetup.shippoTokenPresent) ? (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-xs text-amber-100">
            <p className="font-semibold text-amber-50">Label setup</p>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11px]">
              {!data.labelSetup.shippoTokenPresent ? (
                <li>
                  Shippo token not visible to the server — redeploy after adding <code className="text-amber-200">SHIPPO_API_TOKEN</code>{" "}
                  in Netlify (Production scope, no quotes around the value).
                </li>
              ) : !data.labelSetup.shippoApiOk ? (
                <li>
                  Shippo rejected the token ({data.labelSetup.shippoTokenKind} key):{" "}
                  {data.labelSetup.shippoApiError ?? "unknown error"}. Copy a fresh test key from Shippo → Settings →
                  API.
                </li>
              ) : (
                <li>
                  Shippo connected ({data.labelSetup.shippoTokenKind} key). Test labels only appear in your Shippo test
                  dashboard — they are not valid for USPS pickup.
                </li>
              )}
              {!data.labelSetup.shipFromComplete ? (
                <li>
                  {data.labelSetup.shipFromNeedsPhoneOnly
                    ? "Ship-from phone missing — add a contact phone in "
                    : "Ship-from address incomplete — add it under "}
                  <Link href="/account/seller" className="font-semibold text-gold-bright/90 hover:underline">
                    Seller HQ
                  </Link>{" "}
                  before creating labels.
                </li>
              ) : null}
            </ul>
          </div>
        ) : data.labelSetup?.shippoApiOk && data.labelSetup.shipFromComplete ? (
          <p className="mt-3 text-[11px] text-zinc-500">
            Shippo ready ({data.labelSetup.shippoTokenKind} key). If bundled label fails, expand the session and check
            the error under the button — common causes are invalid buyer addresses or no USPS/UPS rates.
          </p>
        ) : null}
      </div>

      {grouped.map(([showId, list]) => (
        <Fragment key={showId}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            {list[0]?.liveShowTitle ?? "Show"} · {list.length} session{list.length === 1 ? "" : "s"}
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {list.map((s) => (
              <SessionCard
                key={s.sessionId}
                s={s}
                expanded={openId === s.sessionId}
                onToggle={() => setOpenId((prev) => (prev === s.sessionId ? null : s.sessionId))}
                labelBusyId={labelBusyId}
                bundledBusySessionId={bundledBusySessionId}
                bundledSessionFeedback={bundledSessionFeedback?.[s.sessionId]}
                orderLabelFeedback={orderLabelFeedback}
                onRequestBundledLabel={(session) => setParcelModal({ kind: "bundled", session })}
                onRequestOrderLabel={(session, orderId) => setParcelModal({ kind: "order", session, orderId })}
              />
            ))}
          </div>
        </Fragment>
      ))}

      {parcelModal ? (
        <LabelParcelModal
          contextLine={
            parcelModal.kind === "bundled"
              ? `${parcelModal.session.liveShowTitle} · ${
                  parcelModal.session.buyer.name?.trim()
                    ? `${parcelModal.session.buyer.name} (@${parcelModal.session.buyer.username})`
                    : `@${parcelModal.session.buyer.username}`
                } · ${parcelModal.session.orderCount} order${parcelModal.session.orderCount === 1 ? "" : "s"} · System est: ${parcelModal.session.pricingWeightOz.toFixed(1)} oz`
              : `${parcelModal.session.liveShowTitle} · ${
                  parcelModal.session.orders.find((o) => o.id === parcelModal.orderId)?.listingTitle ?? "Order"
                } · System est: ${parcelModal.session.pricingWeightOz.toFixed(1)} oz`
          }
          sessionId={parcelModal.kind === "bundled" ? parcelModal.session.sessionId : undefined}
          shippingChargedCents={parcelModal.session.shippingChargedCents}
          onConfirm={(parcel, format) => {
            const modal = parcelModal;
            setParcelModal(null);
            if (modal.kind === "bundled") {
              onCreateBundledLabel(modal.session.sessionId, parcel, format);
            } else {
              onCreateLabel(modal.orderId, parcel, format);
            }
          }}
          onCancel={() => setParcelModal(null)}
        />
      ) : null}
    </section>
  );
}
