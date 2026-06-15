"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import { SellerShippingLabelPanel } from "@/components/account/SellerShippingLabelPanel";
import { sellerMayShowFulfillmentControls } from "@/lib/order-shipping-guards";
import { orderHasPurchasedLabel } from "@/lib/seller-shipping-label-state";
import { buildSellerOrderMilestones } from "@/lib/order-timeline";
import { SellerMilestoneSteps } from "@/components/orders/OrderTimeline";

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

export function AccountSellerOrderDetailPage({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);

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

  const createLabel = async () => {
    setLabelError(null);
    setLabelBusy(true);
    try {
      const res = await fetch(`/api/account/sales/${encodeURIComponent(orderId)}/create-label`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setLabelError(data.error ?? "Could not create label.");
        return;
      }
      await load();
    } catch {
      setLabelError("Something went wrong.");
    } finally {
      setLabelBusy(false);
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
        <div className="mx-auto w-full max-w-3xl px-4 py-10 text-sm text-zinc-500">Loading order…</div>
      </main>
    );
  }

  const fulfillmentAllowed = sellerMayShowFulfillmentControls(order);
  const hasLabel = orderHasPurchasedLabel(order);
  const canCreateLabel = fulfillmentAllowed && !hasLabel;
  const milestones = buildSellerOrderMilestones({
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    orderStatus: order.status,
    trackingNumber: order.trackingNumber,
    labelUrl: order.labelUrl,
    shippoTransactionId: order.shippoTransactionId,
  });

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="relative mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <AccountOrdersNav active="sales" />
        <Link href="/account/sales" className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 hover:text-gold-bright">
          ← Sales
        </Link>
        <h1 className="font-display mt-4 text-2xl font-bold text-foreground">Order detail</h1>
        <p className="mt-1 font-mono text-xs text-zinc-500">{order.id}</p>

        <div className="mt-8">
          <SellerMilestoneSteps milestones={milestones} heading="Fulfillment checklist" />
        </div>

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
          canCreateLabel={canCreateLabel}
          onCreateLabel={createLabel}
          createLabelBusy={labelBusy}
        />
        {labelError ? <p className="mt-2 text-xs font-medium text-rose-300">{labelError}</p> : null}

        <div className="mt-6 space-y-4 rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6">
          <div className="flex gap-3">
            {order.listing.images[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={order.listing.images[0].url} alt="" className="size-16 rounded-lg border border-white/10 object-cover" />
            ) : null}
            <div>
              <p className="font-medium text-zinc-100">{order.listing.title}</p>
              <p className="mt-1 text-xs text-zinc-500">
                @{order.buyer.username ?? "buyer"} · {formatDate(order.createdAt)}
              </p>
            </div>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-zinc-500">Payment</span>
              <p className="font-medium text-zinc-200">{order.paymentStatus.replace(/_/g, " ")}</p>
            </div>
            <div>
              <span className="text-zinc-500">Fulfillment</span>
              <p className="font-medium text-zinc-200">{order.fulfillmentStatus.replace(/_/g, " ")}</p>
            </div>
            <div>
              <span className="text-zinc-500">Next step</span>
              <p className="font-medium text-zinc-200">{order.sellerNextAction}</p>
            </div>
            <div>
              <span className="text-zinc-500">Est. payout</span>
              <p className="font-mono font-medium text-zinc-200">{formatMoney(order.payoutEstimateUsd)}</p>
            </div>
          </div>
          <div className="border-t border-white/[0.06] pt-4 text-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Ship to</p>
            <p className="mt-2 text-zinc-200">
              {order.shipRecipientName}
              <br />
              {order.shipAddress}
              <br />
              {order.shipCity}, {order.shipState} {order.shipZip}
              <br />
              {order.shipCountry}
            </p>
          </div>
          <div className="border-t border-white/[0.06] pt-4 text-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Order totals</p>
            <div className="mt-2 space-y-1 font-mono text-xs text-zinc-300">
              <p>Item {formatMoney(order.itemPriceUsd)}</p>
              <p>Shipping {formatMoney(order.shippingPriceUsd)}</p>
              <p>Tax {formatMoney(order.taxUsd)}</p>
              <p className="font-bold text-gold-bright">Total {formatMoney(order.totalUsd)}</p>
            </div>
          </div>
        </div>

        {activityLog.length > 0 ? (
          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Activity log</p>
            <ul className="mt-4 divide-y divide-white/[0.06]">
              {activityLog.map((ev) => (
                <li key={ev.id} className="py-3 first:pt-0">
                  <p className="text-sm font-semibold text-zinc-200">{ev.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{ev.body}</p>
                  <p className="mt-1 font-mono text-[10px] text-zinc-600">
                    {new Date(ev.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
