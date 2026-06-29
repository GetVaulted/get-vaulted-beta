"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AccountLiveShipmentsSection } from "@/components/account/AccountLiveShipmentsSection";
import { AccountSellerLiveSalesSection } from "@/components/account/AccountSellerLiveSalesSection";
import { SellerPayoutTierCard } from "@/components/account/SellerPayoutTierCard";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import { useRequireSellerActivation } from "@/hooks/useRequireSellerActivation";
import { ExpiredAuctionRecoveryPanel } from "@/components/listings/ExpiredAuctionRecoveryPanel";
import { PaymentDeadlineCountdown } from "@/components/orders/PaymentDeadlineCountdown";
import { orderStatusLabel, orderStatusTone } from "@/lib/order-status";
import { sellerMayShowFulfillmentControls } from "@/lib/order-shipping-guards";
import type { SellerLiveShippingDashboard } from "@/lib/seller-live-shipping-dashboard-types";

type SaleRow = {
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
  sellerNextAction: string;
  payoutStatus: string;
  payoutBlockedReason: string | null;
  payoutHoldUntil: string | null;
  payoutReserveAmountCents: number;
  deliveryConfirmedAt: string | null;
  payoutMethod: string;
  payoutEstimateUsd: number;
  buyer: { username: string };
  listing: { id: string; title: string; status?: string; images: { url: string }[] };
};
function formatBundledLabelError(error: string | undefined, code: string | undefined): string {
  if (code === "SHIPPO_NOT_CONFIGURED") {
    return "Shippo is not configured on this server. Add SHIPPO_API_TOKEN (your shippo_test_ key) in Netlify env vars and redeploy.";
  }
  if (code === "SELLER_SHIP_FROM_INCOMPLETE") {
    return "Complete your ship-from address under Account → Seller before creating labels.";
  }
  if (code === "NO_ELIGIBLE_ORDERS") {
    return "No paid, unlabeled orders in this bundle. Wait for buyer payment or use per-order labels for ship-alone items.";
  }
  if (code === "NOT_A_COMBINED_BUNDLE_SESSION") {
    return "This session is ship-alone only — use Create label on each order in the table below.";
  }
  if (error?.includes("No Shippo rates")) {
    return "Shippo returned no USPS/UPS rates. Check seller ship-from, buyer address, and your Shippo test token.";
  }
  return error ?? "Bundled label creation failed.";
}

type BundledSessionFeedback = { tone: "error" | "success" | "warning"; message: string };

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

function ShipModal({
  order,
  mode,
  onClose,
  onDone,
}: {
  order: SaleRow;
  mode: "markShipped" | "tracking";
  onClose: () => void;
  onDone: () => void;
}) {
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setError(null);
    setSending(true);
    try {
      const body =
        mode === "markShipped"
          ? { markShipped: true, ...(tracking.trim() ? { trackingNumber: tracking.trim() } : {}) }
          : { trackingNumber: tracking.trim() || null };

      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not update.");
        return;
      }
      onDone();
      onClose();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      role="dialog"
      aria-modal
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#111114] p-5 shadow-2xl">
        <h2 className="font-display text-lg font-bold text-foreground">
          {mode === "markShipped" ? "Mark as shipped" : "Tracking number"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          {mode === "markShipped"
            ? "Optional: add a carrier tracking number now, or leave blank and add it later."
            : "Add or update the tracking number for this shipment."}
        </p>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Tracking (optional)</span>
          <input
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="e.g. 1Z999AA10123456784"
            className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
          />
        </label>
        {error ? <p className="mt-2 text-xs font-medium text-rose-300">{error}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full border border-white/12 px-4 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.04]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void submit()}
            className="h-10 rounded-full bg-gradient-to-r from-gold to-gold-bright px-5 text-sm font-bold text-zinc-950 transition hover:brightness-110 disabled:opacity-60"
          >
            {sending ? "Saving…" : mode === "markShipped" ? "Mark shipped" : "Save tracking"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatPayoutStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function payoutStatusTone(status: string): string {
  if (status === "paid_out" || status === "instant_payout_ready") return "text-emerald-300";
  if (status === "blocked" || status === "manual_review") return "text-amber-300";
  return "text-zinc-300";
}

type SalesView = "fulfillment" | "live";

export function AccountSalesPage() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const initialView: SalesView = searchParams.get("view") === "live" ? "live" : "fulfillment";
  const [salesView, setSalesView] = useState<SalesView>(initialView);
  const { ready: sellerReady, loading: sellerGateLoading } = useRequireSellerActivation();
  const [rows, setRows] = useState<SaleRow[] | null>(null);
  const [sellerPayout, setSellerPayout] = useState<{
    instantPayoutEligible: boolean;
    instantPayoutStatus: string;
    eligibilityMessage?: string;
  } | null>(null);
  const [liveShipping, setLiveShipping] = useState<SellerLiveShippingDashboard | null>(null);
  const [liveShippingLoading, setLiveShippingLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ order: SaleRow; mode: "markShipped" | "tracking" } | null>(null);
  const [labelBusyId, setLabelBusyId] = useState<string | null>(null);
  const [bundledBusySessionId, setBundledBusySessionId] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [bundledSessionFeedback, setBundledSessionFeedback] = useState<Record<string, BundledSessionFeedback>>({});
  const salesLoadedOnceRef = useRef(false);

  useEffect(() => {
    setSalesView(searchParams.get("view") === "live" ? "live" : "fulfillment");
  }, [searchParams]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    setLoadError(null);
    const silent = opts?.silent ?? salesLoadedOnceRef.current;
    if (!silent) setLiveShippingLoading(true);
    try {
      const [salesRes, liveRes] = await Promise.all([
        fetch("/api/account/sales"),
        fetch("/api/account/live-shipping"),
      ]);
      if (!salesRes.ok) {
        setRows([]);
        setLiveShipping(null);
        setLoadError(salesRes.status === 401 ? "Please sign in again." : "Could not load sales. Try again.");
        return;
      }
      const data = (await salesRes.json()) as {
        orders?: SaleRow[];
        sellerPayout?: {
          instantPayoutEligible: boolean;
          instantPayoutStatus: string;
          eligibilityMessage?: string;
        };
      };
      setRows(Array.isArray(data.orders) ? data.orders : []);
      setSellerPayout(data.sellerPayout ?? null);
      if (liveRes.ok) {
        const live = (await liveRes.json()) as SellerLiveShippingDashboard;
        if (live && Array.isArray(live.sessions) && live.totals) {
          setLiveShipping(live);
        } else {
          setLiveShipping(null);
        }
      } else {
        setLiveShipping(null);
      }
      salesLoadedOnceRef.current = true;
    } finally {
      if (!silent) setLiveShippingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  useEffect(() => {
    if (status !== "authenticated" || salesView !== "fulfillment") return undefined;
    const pollMs = 12_000;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void load({ silent: true });
    };
    const id = window.setInterval(tick, pollMs);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, salesView, status]);

  useEffect(() => {
    const on = () => void load();
    window.addEventListener("gv-orders-updated", on);
    window.addEventListener("gv-layaways-updated", on);
    return () => {
      window.removeEventListener("gv-orders-updated", on);
      window.removeEventListener("gv-layaways-updated", on);
    };
  }, [load]);

  const createLabel = async (orderId: string) => {
    setLabelError(null);
    setLabelBusyId(orderId);
    try {
      const res = await fetch(`/api/account/sales/${encodeURIComponent(orderId)}/create-label`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!res.ok) {
        setLabelError(j.error ?? "Label creation failed.");
        return;
      }
      if (typeof j.warning === "string") setLabelError(j.warning);
      else setLabelError(null);
      await load();
    } finally {
      setLabelBusyId(null);
    }
  };

  const createBundledLabel = async (sessionId: string) => {
    setLabelError(null);
    setBundledSessionFeedback((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setBundledBusySessionId(sessionId);
    try {
      const res = await fetch(`/api/account/live-shipping/${encodeURIComponent(sessionId)}/create-label`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        warning?: string;
        labelUrl?: string | null;
        alreadyExisted?: boolean;
      };
      if (!res.ok) {
        const msg = formatBundledLabelError(j.error, j.code);
        setLabelError(msg);
        setBundledSessionFeedback((prev) => ({ ...prev, [sessionId]: { tone: "error", message: msg } }));
        return;
      }
      if (typeof j.warning === "string" && j.warning.trim()) {
        setLabelError(j.warning);
        setBundledSessionFeedback((prev) => ({ ...prev, [sessionId]: { tone: "warning", message: j.warning! } }));
      } else if (j.alreadyExisted) {
        const msg = "Bundled label already exists for this session.";
        setBundledSessionFeedback((prev) => ({ ...prev, [sessionId]: { tone: "success", message: msg } }));
      } else {
        const msg = j.labelUrl
          ? "Bundled label created — open View label below."
          : "Label purchase recorded. Refresh if the PDF link does not appear.";
        setBundledSessionFeedback((prev) => ({ ...prev, [sessionId]: { tone: "success", message: msg } }));
      }
      await load();
    } catch {
      const msg = "Network error — could not reach the server. Try again.";
      setLabelError(msg);
      setBundledSessionFeedback((prev) => ({ ...prev, [sessionId]: { tone: "error", message: msg } }));
    } finally {
      setBundledBusySessionId(null);
    }
  };

  if (status === "loading" || sellerGateLoading || (salesView === "fulfillment" && rows === null)) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  if (!sellerReady) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Redirecting to seller setup…</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      {modal ? (
        <ShipModal
          order={modal.order}
          mode={modal.mode}
          onClose={() => setModal(null)}
          onDone={() => void load()}
        />
      ) : null}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(360px,50vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <header className="border-b border-white/[0.07] pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Account</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Your sales</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            {salesView === "live"
              ? "Live sales by show — item, buyer, time, and amount as you sell."
              : "Orders where you are the seller — payment and fulfillment status."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSalesView("fulfillment")}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                salesView === "fulfillment"
                  ? "border-gold/45 bg-gold/12 text-gold-bright"
                  : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
              }`}
            >
              All orders
            </button>
            <button
              type="button"
              onClick={() => setSalesView("live")}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                salesView === "live"
                  ? "border-gold/45 bg-gold/12 text-gold-bright"
                  : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
              }`}
            >
              Live shows
            </button>
          </div>
          <p className="mt-2 text-sm">
            <Link href="/account/sales/layaways" className="font-semibold text-gold-bright hover:underline">
              View layaways →
            </Link>
          </p>
          <div className="mt-4">
            <AccountOrdersNav active="sales" />
          </div>
        </header>

        {salesView === "live" ? <AccountSellerLiveSalesSection /> : null}

        {salesView === "fulfillment" && rows !== null ? (
          <>
        {labelError ? (
          <p className="mt-6 rounded-lg border border-rose-500/30 bg-rose-950/30 px-4 py-2 text-sm text-rose-100">{labelError}</p>
        ) : null}

        <div className="mt-4">
          <SellerPayoutTierCard />
        </div>

        {loadError ? (
          <div className="mt-8 rounded-2xl border border-rose-500/25 bg-rose-950/25 px-6 py-10 text-center">
            <p className="text-sm font-medium text-rose-100">{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-rose-300/30 px-6 text-xs font-bold uppercase tracking-wide text-rose-50 transition hover:bg-rose-500/10"
            >
              Retry
            </button>
            <Link href="/account/seller" className="mt-4 block text-xs font-semibold text-gold-bright hover:underline">
              Open seller hub
            </Link>
          </div>
        ) : rows.length === 0 && (!liveShipping || liveShipping.sessions.length === 0) ? (
          <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-16 text-center">
            <p className="font-display text-lg font-semibold text-foreground">No sales yet.</p>
            <p className="mt-2 text-sm text-zinc-500">
              Publish listings with Stripe Connect and parcel details enabled. Pending payments and shipping steps surface here and in{" "}
              <Link href="/account/notifications" className="font-semibold text-gold-bright/90 hover:underline">
                notifications
              </Link>
              .
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/account/listings"
                className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110"
              >
                View my listings
              </Link>
              <Link
                href="/account/seller"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-8 text-sm font-semibold text-zinc-200 transition hover:border-gold/35"
              >
                Seller hub
              </Link>
            </div>
          </div>
        ) : (
          <>
            <AccountLiveShipmentsSection
              data={liveShipping}
              loading={liveShippingLoading}
              labelBusyId={labelBusyId}
              bundledBusySessionId={bundledBusySessionId}
              bundledSessionFeedback={bundledSessionFeedback}
              onCreateLabel={(orderId) => void createLabel(orderId)}
              onCreateBundledLabel={(sid) => void createBundledLabel(sid)}
            />
            {rows.length === 0 ? (
              <p className="mt-6 text-center text-sm text-zinc-500">
                No orders in the table yet — live shipment bundles above reflect paid live checkouts.
              </p>
            ) : null}
            {rows.length === 0 ? null : (
            <div className="mt-8 hidden overflow-x-auto rounded-xl border border-white/[0.08] bg-[#08080a] lg:block">
              <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-2.5 pl-3.5">Item</th>
                    <th className="px-2 py-2.5">Buyer</th>
                    <th className="px-2 py-2.5">Ship to</th>
                    <th className="px-2 py-2.5">Total</th>
                    <th className="px-2 py-2.5">Payment</th>
                    <th className="px-2 py-2.5">Next step</th>
                    <th className="px-2 py-2.5">Fulfillment</th>
                    <th className="px-2 py-2.5">Payout</th>
                    <th className="px-2 py-2.5">Tracking</th>
                    <th className="px-2 py-2.5">Date</th>
                    <th className="px-3 py-2.5 pr-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const showRecovery = o.paymentStatus === "expired" || o.listing.status === "auction_ended_unpaid";
                    const thumb = o.listing.images[0]?.url;
                    const fulfillmentAllowed = sellerMayShowFulfillmentControls(o);
                    const canMarkShipped =
                      fulfillmentAllowed && (o.status === "pending" || o.status === "paid");
                    const canTracking = fulfillmentAllowed && o.status === "shipped";
                    const paid = o.paymentStatus === "paid";
                    const hasLabel = Boolean(o.shippoTransactionId || o.labelUrl);
                    const canCreateLabel = fulfillmentAllowed && !hasLabel;
                    return (
                      <Fragment key={o.id}>
                      <tr className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                        <td className="px-3 py-2 pl-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="relative size-11 shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#0b0b0e]">
                              {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-[9px] text-zinc-600">—</div>
                              )}
                            </div>
                            <p className="line-clamp-2 max-w-[10rem] font-medium leading-snug text-zinc-100">{o.listing.title}</p>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs text-zinc-400">@{o.buyer.username}</td>
                        <td className="px-2 py-2 text-xs text-zinc-400">
                          {o.shipCity}, {o.shipState}
                        </td>
                        <td className="px-2 py-2 font-mono text-xs font-semibold tabular-nums text-zinc-200">{formatMoney(o.totalUsd)}</td>
                        <td className="px-2 py-2 font-mono text-[10px] uppercase text-zinc-300">{o.paymentStatus}</td>
                        <td className="px-2 py-2 text-[10px] leading-snug text-zinc-300">
                          <span className="font-semibold text-zinc-200">{o.sellerNextAction}</span>
                          {o.paymentStatus === "pending_payment" && o.paymentDeadlineAt ? (
                            <span className="mt-1 block font-mono text-[9px] text-amber-200/90">
                              <PaymentDeadlineCountdown deadlineIso={o.paymentDeadlineAt} />
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 font-mono text-[10px] uppercase text-zinc-300">{o.fulfillmentStatus}</td>
                        <td className="px-2 py-2 text-[10px]">
                          <span className={`font-mono uppercase ${payoutStatusTone(o.payoutStatus)}`}>
                            {formatPayoutStatus(o.payoutStatus)}
                          </span>
                          {o.payoutBlockedReason ? (
                            <span className="mt-0.5 block text-[9px] text-amber-200/80">{o.payoutBlockedReason}</span>
                          ) : null}
                          {o.payoutReserveAmountCents > 0 ? (
                            <span className="mt-0.5 block text-[9px] text-zinc-500">
                              Reserve {formatMoney(o.payoutReserveAmountCents / 100)}
                            </span>
                          ) : null}
                          {o.payoutHoldUntil && o.payoutStatus !== "paid_out" ? (
                            <span className="mt-0.5 block text-[9px] text-zinc-500">
                              Hold until {formatDate(o.payoutHoldUntil)}
                            </span>
                          ) : null}
                          {o.paymentStatus === "paid" ? (
                            <span className="mt-0.5 block text-[9px] text-zinc-400">
                              Est. payout {formatMoney(o.payoutEstimateUsd)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-[10px] text-zinc-400">
                          {o.trackingNumber ? (
                            <span className="font-mono text-zinc-200">{o.trackingNumber}</span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs tabular-nums text-zinc-500">{formatDate(o.createdAt)}</td>
                        <td className="px-3 py-2 pr-3.5 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Link
                              href={`/account/sales/${encodeURIComponent(o.id)}`}
                              className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-gold/35 hover:text-gold-bright"
                            >
                              View
                            </Link>
                            {canCreateLabel ? (
                              <button
                                type="button"
                                disabled={labelBusyId === o.id}
                                onClick={() => void createLabel(o.id)}
                                className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-100/90 transition hover:bg-sky-500/15 disabled:opacity-50"
                              >
                                {labelBusyId === o.id ? "…" : "Create label"}
                              </button>
                            ) : null}
                            {o.labelUrl ? (
                              <a
                                href={o.labelUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:border-gold/35"
                              >
                                Print label
                              </a>
                            ) : null}
                            {o.trackingUrl ? (
                              <a
                                href={o.trackingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:border-gold/35"
                              >
                                Track
                              </a>
                            ) : null}
                            {canMarkShipped ? (
                              <button
                                type="button"
                                onClick={() => setModal({ order: o, mode: "markShipped" })}
                                className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-100/90 transition hover:bg-emerald-500/15"
                              >
                                Mark shipped
                              </button>
                            ) : null}
                            {canTracking ? (
                              <button
                                type="button"
                                onClick={() => setModal({ order: o, mode: "tracking" })}
                                className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-white/20"
                              >
                                {o.trackingNumber ? "Edit tracking" : "Add tracking"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {showRecovery ? (
                        <tr className="border-b border-white/[0.05] bg-rose-950/5 last:border-0">
                          <td colSpan={10} className="px-3 py-3 pl-3.5 pr-3.5">
                            <ExpiredAuctionRecoveryPanel listingId={o.listing.id} compact onDone={() => void load()} />
                          </td>
                        </tr>
                      ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

            {rows.length === 0 ? null : (
            <div className="mt-6 space-y-3 lg:hidden">
              {rows.map((o) => {
                const showRecovery = o.paymentStatus === "expired" || o.listing.status === "auction_ended_unpaid";
                const thumb = o.listing.images[0]?.url;
                const fulfillmentAllowed = sellerMayShowFulfillmentControls(o);
                const canMarkShipped =
                  fulfillmentAllowed && (o.status === "pending" || o.status === "paid");
                const canTracking = fulfillmentAllowed && o.status === "shipped";
                const paid = o.paymentStatus === "paid";
                const hasLabel = Boolean(o.shippoTransactionId || o.labelUrl);
                const canCreateLabel = fulfillmentAllowed && !hasLabel;
                return (
                  <div key={o.id} className="rounded-xl border border-white/[0.08] bg-[#0a0a0d] p-3.5">
                    <div className="flex gap-3">
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0b0b0e]">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">—</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug text-zinc-100">{o.listing.title}</p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          Buyer @{o.buyer.username} · {o.shipCity}, {o.shipState}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-gold-bright">{formatMoney(o.totalUsd)}</span>
                          <span className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase ${orderStatusTone(o.status)}`}>
                            {orderStatusLabel(o.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          Pay: <span className="font-mono text-zinc-300">{o.paymentStatus}</span> · Ship:{" "}
                          <span className="font-mono text-zinc-300">{o.fulfillmentStatus}</span>
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          Payout:{" "}
                          <span className={`font-mono uppercase ${payoutStatusTone(o.payoutStatus)}`}>
                            {formatPayoutStatus(o.payoutStatus)}
                          </span>
                          {o.payoutBlockedReason ? (
                            <span className="block text-amber-200/80">{o.payoutBlockedReason}</span>
                          ) : null}
                          {o.paymentStatus === "paid" ? (
                            <span className="block text-zinc-500">Est. payout {formatMoney(o.payoutEstimateUsd)}</span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-[10px] font-semibold text-zinc-200">Next: {o.sellerNextAction}</p>
                        {o.paymentStatus === "pending_payment" && o.paymentDeadlineAt ? (
                          <p className="mt-0.5 font-mono text-[10px] text-amber-200/90">
                            <PaymentDeadlineCountdown deadlineIso={o.paymentDeadlineAt} />
                          </p>
                        ) : null}
                        {o.trackingNumber ? (
                          <p className="mt-1 font-mono text-[10px] text-zinc-400">{o.trackingNumber}</p>
                        ) : null}
                        <p className="mt-1 text-[10px] tabular-nums text-zinc-600">{formatDate(o.createdAt)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                      <Link
                        href={`/account/sales/${encodeURIComponent(o.id)}`}
                        className="inline-flex h-9 flex-1 min-w-[5rem] items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-xs font-semibold text-zinc-200"
                      >
                        View order
                      </Link>
                      {canCreateLabel ? (
                        <button
                          type="button"
                          disabled={labelBusyId === o.id}
                          onClick={() => void createLabel(o.id)}
                          className="inline-flex h-9 flex-1 min-w-[5rem] items-center justify-center rounded-lg border border-sky-400/30 bg-sky-500/10 text-xs font-semibold text-sky-100"
                        >
                          {labelBusyId === o.id ? "…" : "Create label"}
                        </button>
                      ) : null}
                      {o.labelUrl ? (
                        <a
                          href={o.labelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 flex-1 min-w-[5rem] items-center justify-center rounded-lg border border-white/10 text-xs font-medium text-zinc-300"
                        >
                          Print label
                        </a>
                      ) : null}
                      {o.trackingUrl ? (
                        <a
                          href={o.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 flex-1 min-w-[5rem] items-center justify-center rounded-lg border border-white/10 text-xs font-medium text-zinc-300"
                        >
                          Tracking
                        </a>
                      ) : null}
                      {canMarkShipped ? (
                        <button
                          type="button"
                          onClick={() => setModal({ order: o, mode: "markShipped" })}
                          className="inline-flex h-9 flex-1 min-w-[5rem] items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-xs font-semibold text-emerald-100"
                        >
                          Mark shipped
                        </button>
                      ) : null}
                      {canTracking ? (
                        <button
                          type="button"
                          onClick={() => setModal({ order: o, mode: "tracking" })}
                          className="inline-flex h-9 flex-1 min-w-[5rem] items-center justify-center rounded-lg border border-white/10 text-xs font-medium text-zinc-400"
                        >
                          {o.trackingNumber ? "Edit tracking" : "Add tracking"}
                        </button>
                      ) : null}
                    </div>
                    {showRecovery ? (
                      <div className="mt-3">
                        <ExpiredAuctionRecoveryPanel listingId={o.listing.id} compact onDone={() => void load()} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            )}
          </>
        )}
      </>
        ) : null}
      </div>
    </main>
  );
}
