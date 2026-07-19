"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { describeAuctionChargeSlotForAdmin } from "@/lib/auction-bid-payment-labels";
import { AdminOrderPayoutPanel } from "@/components/admin/AdminOrderPayoutPanel";
import { AdminOrderEvidencePanel } from "@/components/admin/AdminOrderEvidencePanel";

type ShippingReconciliation = {
  buyerShippingCents: number;
  actualLabelCostCents: number | null;
  labelStatus: "none" | "purchased" | "exception";
  paidByPlatform: boolean;
  sellerDeductionCents: number;
  deductionStatus: string;
  netShippingVarianceCents: number;
  shippoTransactionId: string | null;
  shippingLabelCostReversalId: string | null;
  flagged: boolean;
  flagReasons: string[];
};

type OrderPayload = {
  id: string;
  status: string;
  totalUsd: number;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  trackingNumber: string | null;
  shippedAt: string | null;
  paymentLabel: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
  updatedAt: string;
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  payoutStatus: string;
  deliveryConfirmedAt: string | null;
  payoutBlockedReason: string | null;
  payoutHoldUntil: string | null;
  payoutReserveAmountCents: number;
  payoutMethod: string;
  shippingChargedCents: number | null;
  shippingLabelCostCents: number | null;
  shippingLabelCostReversedCents: number;
  shippingLabelCostReversalId: string | null;
  shippoTransactionId: string | null;
  labelUrl: string | null;
  labelCreatedAt: string | null;
  shippingStatus: string | null;
  shippingReconciliation: ShippingReconciliation | null;
  liveShippingSession: {
    id: string;
    shippingChargedCents: number;
    estimatedLabelCostCents: number | null;
    finalLabelCostCents: number | null;
    shippingMode: string | null;
  } | null;
  payoutEvaluation: {
    sellerEligible: boolean;
    instantPayoutAllowed: boolean;
    disqualifiers: string[];
    sellerRequirementsFailed: string[];
  } | null;
  buyer: { id: string; username: string; email: string };
  seller: { id: string; username: string; email: string };
  listing: {
    id: string;
    title: string;
    status: string;
    category: string;
    buyingFormat: string;
    moderationRemovedAt: string | null;
    seller: { id: string; username: string; email: string };
  };
};

export function AdminOrderDetailPage() {
  const params = useParams();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  const [data, setData] = useState<OrderPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" });
      if (!res.ok) {
        setData(null);
        return;
      }
      const j = (await res.json()) as { order?: OrderPayload };
      setData(j.order ?? null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[1920px] px-3 py-16 text-center text-sm text-zinc-500 sm:px-4 lg:px-10">
        Loading…
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-[1920px] px-3 py-16 text-center sm:px-4 lg:px-10">
        <p className="text-sm text-zinc-500">Order not found.</p>
        <Link href="/admin/orders" className="mt-4 inline-block text-xs font-semibold text-gold-bright hover:underline">
          ← Orders
        </Link>
      </main>
    );
  }

  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-4 lg:px-10">
      <Link href="/admin/orders" className="text-xs font-semibold text-zinc-500 hover:text-gold-bright">
        ← Orders
      </Link>
      <h1 className="font-display mt-4 text-xl font-black tracking-tight">Order</h1>
      <p className="mt-1 font-mono text-[11px] text-zinc-500">{data.id}</p>

      <section className="mt-6 space-y-4 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
        <div className="flex flex-wrap justify-between gap-2 border-b border-white/[0.06] pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Status</p>
            <p className="mt-1 capitalize text-zinc-100">{data.status}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Total</p>
            <p className="mt-1 tabular-nums text-zinc-100">{money(data.totalUsd)}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Buyer</p>
            <p className="mt-1 text-zinc-200">@{data.buyer.username}</p>
            <p className="text-[10px] text-zinc-600">{data.buyer.email}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Seller</p>
            <p className="mt-1 text-zinc-200">@{data.seller.username}</p>
            <p className="text-[10px] text-zinc-600">{data.seller.email}</p>
            <Link
              href={`/admin/users/${encodeURIComponent(data.seller.id)}`}
              className="mt-1 inline-block text-[10px] font-semibold text-gold-bright hover:underline"
            >
              Payout controls →
            </Link>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Listing</p>
          <p className="mt-1 text-zinc-200">{data.listing.title}</p>
          <p className="mt-1 text-[10px] text-zinc-600">
            {data.listing.category} · {data.listing.buyingFormat} · {data.listing.status}
            {data.listing.moderationRemovedAt ? <span className="ml-2 text-rose-400">(removed)</span> : null}
          </p>
          <Link href={`/marketplace/${encodeURIComponent(data.listing.id)}`} className="mt-2 inline-block text-[10px] font-semibold text-gold-bright hover:underline">
            View listing URL
          </Link>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Ship to</p>
          <p className="mt-1 text-zinc-300">
            {data.shipRecipientName}
            <br />
            {data.shipAddress}
            <br />
            {data.shipCity}, {data.shipState} {data.shipZip}
            <br />
            {data.shipCountry}
          </p>
        </div>
        <div className="grid gap-2 border-t border-white/[0.06] pt-3 sm:grid-cols-2">
          <p className="text-zinc-500">
            Item: <span className="text-zinc-300">{money(data.itemPriceUsd)}</span>
          </p>
          <p className="text-zinc-500">
            Shipping: <span className="text-zinc-300">{money(data.shippingPriceUsd)}</span>
          </p>
          <p className="text-zinc-500">
            Payment:{" "}
            <span className="text-zinc-300">{describeAuctionChargeSlotForAdmin(data.paymentLabel)}</span>
          </p>
          <p className="text-zinc-500">
            Tracking: <span className="text-zinc-300">{data.trackingNumber || "—"}</span>
          </p>
        </div>
        <p className="text-[10px] text-zinc-600">
          Created {new Date(data.createdAt).toLocaleString()} · Updated {new Date(data.updatedAt).toLocaleString()}
          {data.shippedAt ? ` · Shipped ${new Date(data.shippedAt).toLocaleString()}` : ""}
        </p>
      </section>

      {data.shippingReconciliation ? (
        <section
          className={`mt-6 space-y-3 rounded-xl border p-4 text-xs ${
            data.shippingReconciliation.flagged
              ? "border-rose-500/40 bg-rose-500/[0.06]"
              : "border-white/[0.08] bg-[#0a0a0d]/80"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-zinc-400">
              Shipping reconciliation
            </h2>
            {data.shippingReconciliation.flagged ? (
              <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-300">
                Flagged
              </span>
            ) : null}
          </div>
          <p className="text-[10px] text-zinc-500">
            Buyer shipping is seller pass-through at charge. Platform pays Shippo for GV labels, then
            claws actual label cost back via Stripe transfer reversal.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <p className="text-zinc-500">
              Buyer shipping collected:{" "}
              <span className="font-mono text-zinc-200">
                {money(data.shippingReconciliation.buyerShippingCents / 100)}
              </span>
            </p>
            <p className="text-zinc-500">
              Actual label cost:{" "}
              <span className="font-mono text-zinc-200">
                {data.shippingReconciliation.actualLabelCostCents != null
                  ? money(data.shippingReconciliation.actualLabelCostCents / 100)
                  : "—"}
              </span>
            </p>
            <p className="text-zinc-500">
              Label status:{" "}
              <span className="capitalize text-zinc-200">{data.shippingReconciliation.labelStatus}</span>
            </p>
            <p className="text-zinc-500">
              Paid by platform:{" "}
              <span className="text-zinc-200">
                {data.shippingReconciliation.paidByPlatform ? "Yes" : "No"}
              </span>
            </p>
            <p className="text-zinc-500">
              Seller deduction:{" "}
              <span className="font-mono text-zinc-200">
                {money(data.shippingReconciliation.sellerDeductionCents / 100)}
              </span>
            </p>
            <p className="text-zinc-500">
              Deduction status:{" "}
              <span className="font-mono text-zinc-200">{data.shippingReconciliation.deductionStatus}</span>
            </p>
            <p className="text-zinc-500">
              Net shipping variance:{" "}
              <span
                className={`font-mono ${
                  data.shippingReconciliation.netShippingVarianceCents === 0
                    ? "text-zinc-200"
                    : "text-rose-300"
                }`}
              >
                {money(data.shippingReconciliation.netShippingVarianceCents / 100)}
              </span>
            </p>
            <p className="text-zinc-500">
              Seller payout status: <span className="capitalize text-zinc-200">{data.payoutStatus}</span>
            </p>
            <p className="text-zinc-500">
              Reversal id:{" "}
              <span className="font-mono text-[10px] text-zinc-300">
                {data.shippingReconciliation.shippingLabelCostReversalId || "—"}
              </span>
            </p>
          </div>
          {data.liveShippingSession ? (
            <p className="text-[10px] text-zinc-600">
              Live session {data.liveShippingSession.id.slice(0, 12)}… · mode{" "}
              {data.liveShippingSession.shippingMode ?? "—"} · session shipping charged{" "}
              {money(data.liveShippingSession.shippingChargedCents / 100)} · session estimate/final label{" "}
              {data.liveShippingSession.estimatedLabelCostCents != null
                ? money(data.liveShippingSession.estimatedLabelCostCents / 100)
                : "—"}
              /
              {data.liveShippingSession.finalLabelCostCents != null
                ? money(data.liveShippingSession.finalLabelCostCents / 100)
                : "—"}{" "}
              (estimate fields may be set before any Shippo purchase)
            </p>
          ) : null}
          {data.shippingReconciliation.flagReasons.length > 0 ? (
            <ul className="space-y-1 text-[11px] text-rose-300">
              {data.shippingReconciliation.flagReasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <AdminOrderPayoutPanel
        orderId={data.id}
        payoutStatus={data.payoutStatus}
        fulfillmentStatus={data.fulfillmentStatus}
        deliveryConfirmedAt={data.deliveryConfirmedAt}
        payoutBlockedReason={data.payoutBlockedReason}
        payoutHoldUntil={data.payoutHoldUntil}
        payoutReserveAmountCents={data.payoutReserveAmountCents}
        payoutMethod={data.payoutMethod}
        payoutEvaluation={data.payoutEvaluation}
        onUpdated={() => void load()}
      />

      <AdminOrderEvidencePanel orderId={data.id} />
    </main>
  );
}
