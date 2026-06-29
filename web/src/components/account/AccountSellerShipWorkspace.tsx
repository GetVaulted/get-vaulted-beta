"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PaymentDeadlineCountdown } from "@/components/orders/PaymentDeadlineCountdown";
import type { SellerLiveShippingDashboard, SellerLiveShippingSessionRow } from "@/lib/seller-live-shipping-dashboard-types";
import { openLabelForPrint } from "@/lib/seller-shipping-label-state";
import {
  countShipQueueActions,
  orderIdsAwaitingBundledLabel,
  sellerShipQueueEligible,
  sellerShipQueuePhase,
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

type Props = {
  orders: ShipWorkspaceOrder[];
  liveShipping: SellerLiveShippingDashboard | null;
  labelBusyId: string | null;
  bundledBusySessionId: string | null;
  bundledSessionFeedback?: Record<string, BundledFeedback>;
  labelError: string | null;
  onCreateLabel: (orderId: string) => void;
  onCreateBundledLabel: (sessionId: string) => void;
  onMarkShipped: (order: ShipWorkspaceOrder) => void;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
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
            Add your ship-from address in{" "}
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
  tone?: "gold" | "sky" | "emerald";
}) {
  const tones = {
    gold: "bg-gradient-to-r from-gold to-gold-bright text-zinc-950 hover:brightness-110",
    sky: "border border-sky-400/40 bg-sky-500/20 text-sky-50 hover:bg-sky-500/30",
    emerald: "border border-emerald-400/35 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25",
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-11 min-w-[9rem] items-center justify-center rounded-xl px-5 text-sm font-bold transition disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function OrderThumb({ url, title }: { url?: string; title: string }) {
  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0b0b0e] sm:size-[4.5rem]">
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

function ShipOrderCard({
  order,
  labelBusyId,
  onCreateLabel,
  onMarkShipped,
  phase,
}: {
  order: ShipWorkspaceOrder;
  labelBusyId: string | null;
  onCreateLabel: (orderId: string) => void;
  onMarkShipped: (order: ShipWorkspaceOrder) => void;
  phase: "needs_label" | "print_and_ship" | "awaiting_carrier" | "in_transit" | "wait_payment";
}) {
  const thumb = order.listing.images[0]?.url;
  const busy = labelBusyId === order.id;

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 gap-3.5">
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
          <PrimaryButton tone="sky" disabled={busy} onClick={() => onCreateLabel(order.id)}>
            {busy ? "Creating…" : "Create label"}
          </PrimaryButton>
        ) : null}
        {phase === "print_and_ship" && order.labelUrl ? (
          <PrimaryButton tone="gold" onClick={() => openLabelForPrint(order.labelUrl!)}>
            Print label
          </PrimaryButton>
        ) : null}
        {phase === "print_and_ship" ? (
          <PrimaryButton tone="emerald" onClick={() => onMarkShipped(order)}>
            Mark shipped
          </PrimaryButton>
        ) : null}
        {phase === "awaiting_carrier" ? (
          <span className="rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-400">
            Awaiting carrier scan — status updates to on the way automatically
          </span>
        ) : null}
        {phase === "in_transit" && order.trackingUrl ? (
          <a
            href={order.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/12 px-5 text-sm font-semibold text-zinc-200 transition hover:border-gold/35"
          >
            Track package
          </a>
        ) : null}
        {phase === "in_transit" && order.labelUrl ? (
          <button
            type="button"
            onClick={() => openLabelForPrint(order.labelUrl!)}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/12 px-4 text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
          >
            Reprint label
          </button>
        ) : null}
        <Link
          href={`/account/sales/${encodeURIComponent(order.id)}`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 px-4 text-sm font-medium text-zinc-500 transition hover:border-white/20 hover:text-zinc-300"
        >
          Details
        </Link>
      </div>
    </article>
  );
}

function BundleShipCard({
  session,
  bundledBusySessionId,
  bundledSessionFeedback,
  onCreateBundledLabel,
}: {
  session: SellerLiveShippingSessionRow;
  bundledBusySessionId: string | null;
  bundledSessionFeedback?: BundledFeedback;
  onCreateBundledLabel: (sessionId: string) => void;
}) {
  const buyer = session.buyer.name?.trim()
    ? `${session.buyer.name} (@${session.buyer.username})`
    : `@${session.buyer.username}`;
  const busy = bundledBusySessionId === session.sessionId;
  const labelUrl = session.bundledLabel?.labelUrl;

  return (
    <article className="rounded-2xl border border-sky-500/25 bg-sky-950/15 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-sky-300/80">Live show bundle</p>
          <p className="mt-0.5 text-lg font-semibold text-zinc-100">{session.liveShowTitle}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {buyer} · {session.orderCount} order{session.orderCount === 1 ? "" : "s"} · {session.itemCount} item
            {session.itemCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.canCreateBundledLabel ? (
            <PrimaryButton tone="sky" disabled={busy} onClick={() => onCreateBundledLabel(session.sessionId)}>
              {busy ? "Creating…" : "Create bundle label"}
            </PrimaryButton>
          ) : null}
          {labelUrl ? (
            <PrimaryButton tone="gold" onClick={() => openLabelForPrint(labelUrl)}>
              Print bundle label
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
  );
}

function SectionHeading({ count, label }: { count: number; label: string }) {
  if (count === 0) return null;
  return (
    <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
      {label} <span className="text-gold-bright/90">({count})</span>
    </h2>
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
}: Props) {
  const [showInTransit, setShowInTransit] = useState(false);
  const [showAwaitingCarrier, setShowAwaitingCarrier] = useState(false);

  const awaitingBundleIds = useMemo(
    () => orderIdsAwaitingBundledLabel(liveShipping?.sessions ?? []),
    [liveShipping],
  );

  const buckets = useMemo(() => {
    const needsLabel: ShipWorkspaceOrder[] = [];
    const printAndShip: ShipWorkspaceOrder[] = [];
    const awaitingCarrier: ShipWorkspaceOrder[] = [];
    const inTransit: ShipWorkspaceOrder[] = [];
    const waitPayment: ShipWorkspaceOrder[] = [];

    for (const order of orders) {
      if (!sellerShipQueueEligible(order)) continue;
      const phase = sellerShipQueuePhase(order);
      if (phase === "needs_label") {
        if (!awaitingBundleIds.has(order.id)) needsLabel.push(order);
      } else if (phase === "print_and_ship") printAndShip.push(order);
      else if (phase === "awaiting_carrier") awaitingCarrier.push(order);
      else if (phase === "in_transit") inTransit.push(order);
      else if (phase === "wait_payment") waitPayment.push(order);
    }

    return { needsLabel, printAndShip, awaitingCarrier, inTransit, waitPayment };
  }, [orders, awaitingBundleIds]);

  const bundleCards = useMemo(() => {
    const sessions = liveShipping?.sessions ?? [];
    return sessions.filter(
      (s) =>
        s.canCreateBundledLabel ||
        Boolean(s.bundledLabel?.labelUrl) ||
        (s.ordersNeedingLabels.length > 0 && s.labelStatus !== "awaiting_payment"),
    );
  }, [liveShipping]);

  const actionCounts = countShipQueueActions(orders, { skipOrderIds: awaitingBundleIds });
  const totalActions =
    actionCounts.needsLabel +
    actionCounts.printAndShip +
    bundleCards.filter((s) => s.canCreateBundledLabel || s.bundledLabel?.labelUrl).length;

  if (totalActions === 0 && buckets.waitPayment.length === 0 && buckets.inTransit.length === 0) {
    return (
      <div className="mt-8 space-y-4">
        <SetupBanner liveShipping={liveShipping} />
        <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-14 text-center">
          <p className="font-display text-xl font-semibold text-foreground">Nothing to ship right now</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            Paid orders that need labels or packing will show up here automatically.
          </p>
          <Link
            href="/account/sales?view=all"
            className="mt-6 inline-flex text-sm font-semibold text-gold-bright hover:underline"
          >
            View all sales history →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <SetupBanner liveShipping={liveShipping} />

      {labelError ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{labelError}</p>
      ) : null}

      {totalActions > 0 ? (
        <p className="rounded-xl border border-gold/20 bg-gold/[0.06] px-4 py-3 text-sm text-zinc-200">
          <span className="font-semibold text-gold-bright">{totalActions}</span> shipment
          {totalActions === 1 ? "" : "s"} need your attention — print labels, mark shipped, then carrier scans update status.
        </p>
      ) : null}

      {bundleCards.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading count={bundleCards.length} label="Live bundles" />
          {bundleCards.map((session) => (
            <BundleShipCard
              key={session.sessionId}
              session={session}
              bundledBusySessionId={bundledBusySessionId}
              bundledSessionFeedback={bundledSessionFeedback?.[session.sessionId]}
              onCreateBundledLabel={onCreateBundledLabel}
            />
          ))}
        </section>
      ) : null}

      {buckets.needsLabel.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading count={buckets.needsLabel.length} label="Create labels" />
          {buckets.needsLabel.map((order) => (
            <ShipOrderCard
              key={order.id}
              order={order}
              labelBusyId={labelBusyId}
              phase="needs_label"
              onCreateLabel={onCreateLabel}
              onMarkShipped={onMarkShipped}
            />
          ))}
        </section>
      ) : null}

      {buckets.printAndShip.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading count={buckets.printAndShip.length} label="Print & ship" />
          {buckets.printAndShip.map((order) => (
            <ShipOrderCard
              key={order.id}
              order={order}
              labelBusyId={labelBusyId}
              phase="print_and_ship"
              onCreateLabel={onCreateLabel}
              onMarkShipped={onMarkShipped}
            />
          ))}
        </section>
      ) : null}

      {buckets.waitPayment.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading count={buckets.waitPayment.length} label="Waiting on buyer payment" />
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
        </section>
      ) : null}

      {buckets.awaitingCarrier.length > 0 ? (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowAwaitingCarrier((v) => !v)}
            className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-300"
          >
            Handed to carrier ({buckets.awaitingCarrier.length}) {showAwaitingCarrier ? "▾" : "▸"}
          </button>
          {showAwaitingCarrier
            ? buckets.awaitingCarrier.map((order) => (
                <ShipOrderCard
                  key={order.id}
                  order={order}
                  labelBusyId={labelBusyId}
                  phase="awaiting_carrier"
                  onCreateLabel={onCreateLabel}
                  onMarkShipped={onMarkShipped}
                />
              ))
            : null}
        </section>
      ) : null}

      {buckets.inTransit.length > 0 ? (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowInTransit((v) => !v)}
            className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-300"
          >
            On the way ({buckets.inTransit.length}) {showInTransit ? "▾" : "▸"}
          </button>
          {showInTransit
            ? buckets.inTransit.map((order) => (
                <ShipOrderCard
                  key={order.id}
                  order={order}
                  labelBusyId={labelBusyId}
                  phase="in_transit"
                  onCreateLabel={onCreateLabel}
                  onMarkShipped={onMarkShipped}
                />
              ))
            : null}
        </section>
      ) : null}
    </div>
  );
}
