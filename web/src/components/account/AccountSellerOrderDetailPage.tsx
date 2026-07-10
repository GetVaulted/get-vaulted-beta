"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import { OrderRefundRequestPanel } from "@/components/orders/OrderRefundRequestPanel";
import { SellerShippingLabelPanel } from "@/components/account/SellerShippingLabelPanel";
import type { SellerLabelPrintFormat } from "@/lib/shippo-label-format";
import { SellerOrderActivityFeed } from "@/components/account/seller-order-detail/SellerOrderActivityFeed";
import { SellerFulfillmentTimelineCompact } from "@/components/account/seller-order-detail/SellerFulfillmentTimelineCompact";
import { SellerOrderSidebarSections } from "@/components/account/seller-order-detail/SellerOrderSidebarSections";
import { buildSellerFulfillmentTimelineCompact } from "@/lib/order-timeline";
import {
  isIncompleteOrderShipping,
  sellerMayShowFulfillmentControls,
} from "@/lib/order-shipping-guards";
import { orderHasPurchasedLabel, orderHasLabelFile } from "@/lib/seller-shipping-label-state";
import {
  formatSellerFulfillmentStatus,
  formatSellerPaymentStatus,
  resolveSellerOrderHeadline,
} from "@/lib/seller-order-detail-display";

type OrderDetail = {
  id: string;
  totalUsd: number;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd: number;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  shippoTransactionId: string | null;
  shippingStatus: string | null;
  labelCreatedAt: string | null;
  shippedAt: string | null;
  sellerNextAction: string;
  payoutStatus: string;
  payoutEstimateUsd: number;
  platformFeeEstimateUsd: number;
  stripeProcessingFeeEstimateUsd: number;
  shippingLabelCostCents?: number | null;
  shippingLabelCostReversedCents?: number | null;
  liveShowId?: string | null;
  listing: { id: string; title: string; status?: string; images: { url: string }[] };
  buyer: { username: string | null };
};

type ActivityRow = { id: string; title: string; body: string; createdAt: string };

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function StatusPill({ label, tone }: { label: string; tone: "gold" | "green" | "zinc" | "sky" | "rose" }) {
  const tones = {
    gold: "border-gold/30 bg-gold/10 text-gold-bright",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    zinc: "border-white/10 bg-white/[0.04] text-zinc-300",
    sky: "border-sky-500/30 bg-sky-500/10 text-sky-100",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}>
      {label}
    </span>
  );
}

export function AccountSellerOrderDetailPage({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [labelBusy, setLabelBusy] = useState(false);
  const [repairBusy, setRepairBusy] = useState(false);
  const [regenerateBusy, setRegenerateBusy] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [markShippedBusy, setMarkShippedBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(`/api/account/sales/${encodeURIComponent(orderId)}`, { cache: "no-store" });
    if (!res.ok) {
      setOrder(null);
      setActivityLog([]);
      setLoadError(res.status === 404 ? "Order not found." : "Could not load order.");
      return;
    }
    const data = (await res.json()) as { order?: OrderDetail; activityLog?: ActivityRow[] };
    setOrder(data.order ?? null);
    setActivityLog(Array.isArray(data.activityLog) ? data.activityLog : []);
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createLabel = async (labelFormat: SellerLabelPrintFormat) => {
    setLabelError(null);
    setLabelBusy(true);
    try {
      const res = await fetch(`/api/account/sales/${encodeURIComponent(orderId)}/create-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelFormat }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!res.ok) {
        setLabelError(data.error ?? "Could not create label.");
        return;
      }
      if (typeof data.warning === "string" && data.warning.trim()) {
        setLabelError(data.warning);
      }
      await load();
    } catch {
      setLabelError("Something went wrong.");
    } finally {
      setLabelBusy(false);
    }
  };

  const markShipped = async () => {
    setMarkShippedBusy(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markShipped: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setLabelError(data.error ?? "Could not mark shipped.");
        return;
      }
      await load();
    } catch {
      setLabelError("Something went wrong.");
    } finally {
      setMarkShippedBusy(false);
    }
  };

  const repairLabel = async () => {
    setLabelError(null);
    setRepairBusy(true);
    try {
      const res = await fetch(`/api/account/sales/${encodeURIComponent(orderId)}/repair-label`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; order?: OrderDetail };
      if (!res.ok) {
        setLabelError(data.error ?? "Could not retrieve label.");
        return;
      }
      if (data.order) setOrder(data.order);
      else await load();
    } catch {
      setLabelError("Something went wrong.");
    } finally {
      setRepairBusy(false);
    }
  };

  const regenerateLabel = async () => {
    if (
      !window.confirm(
        "Purchase a new shipping label? Shippo may charge again if the original label cannot be recovered.",
      )
    ) {
      return;
    }
    setLabelError(null);
    setRegenerateBusy(true);
    try {
      const res = await fetch(`/api/account/sales/${encodeURIComponent(orderId)}/regenerate-label`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; order?: OrderDetail };
      if (!res.ok) {
        setLabelError(data.error ?? "Could not regenerate label.");
        if (data.order) setOrder(data.order);
        return;
      }
      if (data.order) setOrder(data.order);
      else await load();
    } catch {
      setLabelError("Something went wrong.");
    } finally {
      setRegenerateBusy(false);
    }
  };

  if (loadError) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <p className="text-sm text-rose-300">{loadError}</p>
          <Link href="/account/sales" className="mt-4 inline-block text-sm font-semibold text-gold-bright">
            ← Back to sales
          </Link>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 text-sm text-zinc-500">Loading order…</div>
      </main>
    );
  }

  const fulfillmentAllowed = sellerMayShowFulfillmentControls(order);
  const hasLabel = orderHasPurchasedLabel(order);
  const hasLabelFile = orderHasLabelFile(order.labelUrl);
  const canCreateLabel = fulfillmentAllowed && !hasLabel;
  const shippingAddressIncomplete = isIncompleteOrderShipping(order);
  const headline = resolveSellerOrderHeadline(order);
  const timeline = buildSellerFulfillmentTimelineCompact({
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    orderStatus: order.status,
    trackingNumber: order.trackingNumber,
    labelUrl: order.labelUrl,
    shippoTransactionId: order.shippoTransactionId,
  });

  const paymentTone = order.paymentStatus === "paid" ? "green" : "zinc";
  const fulfillmentTone =
    order.fulfillmentStatus === "delivered"
      ? "green"
      : order.fulfillmentStatus === "exception"
        ? "rose"
        : order.fulfillmentStatus === "label_created" ||
            order.fulfillmentStatus === "in_transit" ||
            order.fulfillmentStatus === "shipped"
          ? "sky"
          : "zinc";

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <AccountOrdersNav active="sales" />
        <Link
          href="/account/sales"
          className="mt-6 inline-flex text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 hover:text-gold-bright"
        >
          ← Sales
        </Link>

        {/* Summary header */}
        <header className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0d] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-4">
              {order.listing.images[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={order.listing.images[0].url}
                  alt=""
                  className="size-20 shrink-0 rounded-xl border border-white/10 object-cover sm:size-24"
                />
              ) : (
                <div className="size-20 shrink-0 rounded-xl border border-white/10 bg-zinc-900 sm:size-24" />
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Seller HQ · Order</p>
                <h1 className="font-display mt-1 text-xl font-bold leading-tight text-foreground sm:text-2xl">
                  {order.listing.title}
                </h1>
                <p className="mt-2 font-mono text-[11px] text-zinc-500">
                  {order.id.slice(0, 8).toUpperCase()} · @{order.buyer.username ?? "buyer"} · {formatDate(order.createdAt)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusPill label={formatSellerPaymentStatus(order.paymentStatus)} tone={paymentTone} />
                  <StatusPill label={formatSellerFulfillmentStatus(order.fulfillmentStatus)} tone={fulfillmentTone} />
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-1 lg:items-end lg:text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Order total</p>
              <p className="font-mono text-2xl font-bold text-zinc-100">{formatMoney(order.totalUsd)}</p>
              <p className="text-sm text-zinc-400">
                Est. payout{" "}
                <span className="font-mono font-bold text-gold-bright">{formatMoney(order.payoutEstimateUsd)}</span>
              </p>
            </div>
          </div>

          <div className="border-t border-white/[0.06] bg-black/20 px-5 py-4 sm:px-6">
            <p className="text-sm font-semibold text-zinc-100">{headline.headline}</p>
            <p className="mt-1 text-xs text-zinc-500">{headline.subheadline}</p>
          </div>
        </header>

        {/* Two-column layout */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-6">
            <SellerFulfillmentTimelineCompact steps={timeline} />
            {order.paymentStatus === "paid" || order.paymentStatus === "refunded" ? (
              <OrderRefundRequestPanel orderId={order.id} role="seller" />
            ) : null}
            <SellerOrderActivityFeed events={activityLog} />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6">
            {fulfillmentAllowed ? (
              <SellerShippingLabelPanel
                orderId={order.id}
                carrier={order.carrier}
                service={order.service}
                trackingNumber={order.trackingNumber}
                trackingUrl={order.trackingUrl}
                labelUrl={order.labelUrl}
                shippoTransactionId={order.shippoTransactionId}
                labelCreatedAt={order.labelCreatedAt}
                fulfillmentStatus={order.fulfillmentStatus}
                shippingStatus={order.shippingStatus}
                shippingAddressIncomplete={shippingAddressIncomplete}
                buyerUsername={order.buyer.username}
                canCreateLabel={canCreateLabel}
                onCreateLabel={createLabel}
                createLabelBusy={labelBusy}
                onRepairLabel={repairLabel}
                repairLabelBusy={repairBusy}
                onRegenerateLabel={regenerateLabel}
                regenerateLabelBusy={regenerateBusy}
                labelError={labelError}
                markShippedBusy={markShippedBusy}
                onMarkShipped={
                  hasLabelFile && (order.status === "paid" || order.status === "pending")
                    ? () => void markShipped()
                    : undefined
                }
              />
            ) : null}
            <SellerOrderSidebarSections
              shipRecipientName={order.shipRecipientName}
              shipAddress={order.shipAddress}
              shipCity={order.shipCity}
              shipState={order.shipState}
              shipZip={order.shipZip}
              shipCountry={order.shipCountry}
              buyerUsername={order.buyer.username}
              itemPriceUsd={order.itemPriceUsd}
              shippingPriceUsd={order.shippingPriceUsd}
              taxUsd={order.taxUsd}
              totalUsd={order.totalUsd}
              platformFeeEstimateUsd={order.platformFeeEstimateUsd}
              stripeProcessingFeeEstimateUsd={order.stripeProcessingFeeEstimateUsd}
              payoutEstimateUsd={order.payoutEstimateUsd}
              payoutStatus={order.payoutStatus}
              shippingAddressIncomplete={shippingAddressIncomplete}
              shippingLabelCostCents={order.shippingLabelCostCents}
              shippingLabelCostReversedCents={order.shippingLabelCostReversedCents}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}
