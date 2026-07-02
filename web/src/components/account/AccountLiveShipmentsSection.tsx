"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type {
  SellerLiveShippingDashboard,
  SellerLiveShippingSessionRow,
} from "@/lib/seller-live-shipping-dashboard-types";

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
  onCreateLabel,
  onCreateBundledLabel,
}: {
  s: SellerLiveShippingSessionRow;
  expanded: boolean;
  onToggle: () => void;
  labelBusyId: string | null;
  bundledBusySessionId: string | null;
  bundledSessionFeedback?: { tone: "error" | "success" | "warning"; message: string };
  onCreateLabel: (orderId: string) => void;
  onCreateBundledLabel: (sessionId: string) => void;
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
            onClick={() => onCreateBundledLabel(s.sessionId)}
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
            <a
              href={s.bundledLabel.labelUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-50 transition hover:bg-emerald-500/25"
            >
              View label
            </a>
          ) : null}
        </div>
      ) : null}

      {canShowPerOrderLabelCta ? (
        <div className="mt-3 rounded-lg border border-sky-500/25 bg-sky-950/20 px-3 py-2">
          <p className="text-[11px] font-semibold text-sky-100">Create shipping labels (per order)</p>
          <p className="mt-0.5 text-[10px] text-sky-200/80">
            Use when a bundled label is not available (e.g. ship-alone items or mixed fulfillment).
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {s.ordersNeedingLabels.map((oid) => (
              <button
                key={oid}
                type="button"
                disabled={labelBusyId === oid}
                onClick={() => onCreateLabel(oid)}
                className="rounded-md border border-sky-400/35 bg-sky-500/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-100 transition hover:bg-sky-500/25 disabled:opacity-50"
              >
                {labelBusyId === oid ? "…" : `Label order…`}
              </button>
            ))}
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
  onCreateLabel: (orderId: string) => void;
  onCreateBundledLabel: (sessionId: string) => void;
};

export function AccountLiveShipmentsSection({
  data,
  loading,
  labelBusyId,
  bundledBusySessionId,
  bundledSessionFeedback,
  onCreateLabel,
  onCreateBundledLabel,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

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
                onCreateLabel={onCreateLabel}
                onCreateBundledLabel={onCreateBundledLabel}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </section>
  );
}
