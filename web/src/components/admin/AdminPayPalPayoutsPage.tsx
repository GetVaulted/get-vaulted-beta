"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName, formatAdminUsd } from "@/components/admin/AdminCommandShell";

type OrderRow = {
  orderId: string;
  itemTitle: string;
  estimatedNetUsd: number;
  createdAt: string;
  shippedAt: string | null;
  deliveryConfirmedAt: string | null;
  payoutStatus: string;
  payoutBlockedReason: string | null;
  payoutReleasedAt: string | null;
  paypalPayoutStatus: string | null;
  paypalPayoutFeeCents: number | null;
  processorTransferId: string | null;
  needsAttention: boolean;
};

type SellerRow = {
  sellerId: string;
  username: string | null;
  email: string | null;
  paypalPayoutEmail: string | null;
  paypalPayoutVerifiedAt: string | null;
  orderCount: number;
  owedUsd: number;
  needsAttentionCount: number;
  blockedReason: string | null;
  orders: OrderRow[];
};

type Payload = {
  sellers: SellerRow[];
  sellerCount: number;
  orderCount: number;
  totalOwedUsd: number;
  needsAttentionCount: number;
};

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatAdminUsd(n) ?? `$${n.toFixed(2)}`;
}

/** Where a PayPal-routed order actually stands — this is the thing that wasn't visible before. */
function payoutStageLabel(o: OrderRow): { label: string; tone: "ok" | "warn" | "bad" | "neutral" } {
  if (o.payoutStatus === "paid_out" || o.processorTransferId?.trim()) {
    const status = (o.paypalPayoutStatus ?? "").toLowerCase();
    if (status === "failed" || status === "returned") {
      return { label: `Sent, then ${status}`, tone: "bad" };
    }
    return { label: "Sent to PayPal", tone: "ok" };
  }
  if (o.payoutStatus === "blocked") return { label: "Blocked", tone: "bad" };
  if (o.payoutStatus === "manual_review") return { label: "Manual review", tone: "bad" };
  if (
    o.payoutStatus === "fast_payout_ready" ||
    o.payoutStatus === "label_payout_ready" ||
    o.payoutStatus === "instant_payout_ready"
  ) {
    return { label: "Ready to release", tone: "warn" };
  }
  if (o.payoutStatus === "delivery_confirmed") return { label: "Delivered · awaiting hold", tone: "neutral" };
  if (o.payoutStatus === "held") return { label: "Held", tone: "neutral" };
  return { label: "Pending", tone: "neutral" };
}

function toneClasses(tone: "ok" | "warn" | "bad" | "neutral") {
  switch (tone) {
    case "ok":
      return "text-emerald-200";
    case "warn":
      return "text-amber-200";
    case "bad":
      return "text-rose-300";
    default:
      return "text-zinc-400";
  }
}

export function AdminPayPalPayoutsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reason, setReason] = useState("Admin PayPal payout release");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payouts/paypal", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load PayPal payout queue.");
        return;
      }
      setData((await res.json()) as Payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const releaseOrder = async (o: OrderRow) => {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setBusyOrderId(o.orderId);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(o.orderId)}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release_payout", reason: reason.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Release failed.");
        return;
      }
      setNote(`Released PayPal payout for order ${o.orderId.slice(0, 10)}…`);
      await load();
    } finally {
      setBusyOrderId(null);
    }
  };

  const totalOwed = data?.totalOwedUsd ?? 0;
  const needsAttention = data?.needsAttentionCount ?? 0;

  return (
    <AdminCommandShell
      title="PayPal payouts"
      subtitle="Every paid order routed to the PayPal seller-payout rail, and exactly where each one stands."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/payouts"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]"
          >
            Bank payouts (Stripe)
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]"
          >
            Refresh
          </button>
        </div>
      }
    >
      {loading && !data ? (
        <p className="text-sm text-zinc-500">Loading PayPal payout queue…</p>
      ) : (
        <>
          <div className={`${adminPanelClassName} mb-6 flex flex-wrap items-end justify-between gap-3 p-4`}>
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Sellers</p>
                <p className="mt-1 font-display text-3xl font-black text-foreground">
                  {data?.sellerCount ?? 0}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Orders</p>
                <p className="mt-1 font-display text-3xl font-black text-foreground">
                  {data?.orderCount ?? 0}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Owed (not yet paid)</p>
                <p className="mt-1 font-display text-3xl font-black text-foreground">{money(totalOwed)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Needs attention</p>
                <p
                  className={`mt-1 font-display text-3xl font-black ${
                    needsAttention > 0 ? "text-rose-300" : "text-emerald-200"
                  }`}
                >
                  {needsAttention}
                </p>
              </div>
            </div>
            <label className="flex min-w-[240px] flex-1 flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                Release reason (required)
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
              />
            </label>
          </div>

          <p className="mb-4 text-xs text-zinc-500">
            "Needs attention" = blocked, sent to manual review, or PayPal reported the payout failed / returned.
            Releasing here calls the same PayPal Payouts API as the order detail page — it requires the order to be
            shipped (or delivered) and the seller's PayPal email to be verified.
          </p>

          {note ? (
            <p className="mb-4 rounded-lg border border-sky-400/25 bg-sky-950/30 px-3 py-2 text-sm text-sky-100">
              {note}
            </p>
          ) : null}

          {error ? (
            <p className="mb-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          {!data?.sellers.length ? (
            <p className="text-sm text-zinc-500">No paid orders are on the PayPal payout rail.</p>
          ) : (
            <div className={`${adminPanelClassName} overflow-x-auto`}>
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-3 font-bold">Seller</th>
                    <th className="px-3 py-3 font-bold">PayPal email</th>
                    <th className="px-3 py-3 font-bold">Orders</th>
                    <th className="px-3 py-3 font-bold">Owed</th>
                    <th className="px-3 py-3 font-bold">Needs attention</th>
                    <th className="px-4 py-3 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sellers.map((s) => {
                    const handle = s.username?.trim() || s.sellerId.slice(0, 8);
                    const isOpen = Boolean(expanded[s.sellerId]);
                    const emailReady = !s.blockedReason;
                    return (
                      <Fragment key={s.sellerId}>
                        <tr className="border-b border-white/[0.06] align-middle">
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/users/${encodeURIComponent(s.sellerId)}`}
                              className="font-semibold text-gold-bright hover:underline"
                            >
                              @{handle}
                            </Link>
                            {s.email ? <p className="text-[11px] text-zinc-500">{s.email}</p> : null}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-mono text-[11px] text-zinc-300">
                              {s.paypalPayoutEmail ?? "— not set —"}
                            </p>
                            <p
                              className={`text-[11px] ${emailReady ? "text-emerald-300/90" : "text-amber-200/90"}`}
                            >
                              {emailReady ? "Verified" : "Not verified"}
                            </p>
                          </td>
                          <td className="px-3 py-3 font-mono text-zinc-200">{s.orderCount}</td>
                          <td className="px-3 py-3 font-mono text-zinc-100">{money(s.owedUsd)}</td>
                          <td className="px-3 py-3 font-mono">
                            <span className={s.needsAttentionCount > 0 ? "text-rose-300" : "text-zinc-500"}>
                              {s.needsAttentionCount}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((prev) => ({ ...prev, [s.sellerId]: !prev[s.sellerId] }))
                              }
                              className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200"
                            >
                              {isOpen ? "Hide orders" : "Show orders"}
                            </button>
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className="border-b border-white/[0.06] bg-black/20">
                            <td colSpan={6} className="px-4 py-3">
                              <ul className="divide-y divide-white/[0.05]">
                                {s.orders.map((o) => {
                                  const stage = payoutStageLabel(o);
                                  const alreadySent = Boolean(o.processorTransferId?.trim());
                                  const canRelease = !alreadySent && emailReady;
                                  const busy = busyOrderId === o.orderId;
                                  return (
                                    <li key={o.orderId} className="flex flex-wrap items-start justify-between gap-3 py-3 text-xs">
                                      <div className="min-w-0">
                                        <Link
                                          href={`/admin/orders/${encodeURIComponent(o.orderId)}`}
                                          className="text-zinc-200 hover:text-gold-bright"
                                        >
                                          {o.itemTitle}
                                        </Link>
                                        <p className="mt-0.5 text-[11px] text-zinc-500">
                                          {o.orderId.slice(0, 10)}… · created {new Date(o.createdAt).toLocaleString()}
                                          {o.shippedAt ? ` · shipped ${new Date(o.shippedAt).toLocaleString()}` : ""}
                                        </p>
                                        <p className={`mt-0.5 font-semibold ${toneClasses(stage.tone)}`}>
                                          {stage.label}
                                          {o.paypalPayoutStatus ? ` (PayPal: ${o.paypalPayoutStatus})` : ""}
                                        </p>
                                        {o.processorTransferId ? (
                                          <p className="mt-0.5 break-all font-mono text-[10px] text-zinc-600">
                                            {o.processorTransferId}
                                          </p>
                                        ) : null}
                                        {o.payoutBlockedReason ? (
                                          <p className="mt-0.5 text-[11px] text-amber-200/90">
                                            {o.payoutBlockedReason}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className="flex flex-col items-end gap-1.5">
                                        <span className="font-mono text-zinc-300">{money(o.estimatedNetUsd)}</span>
                                        <button
                                          type="button"
                                          disabled={!canRelease || busy}
                                          onClick={() => void releaseOrder(o)}
                                          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 disabled:opacity-40"
                                        >
                                          {busy ? "Releasing…" : alreadySent ? "Already sent" : "Release"}
                                        </button>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
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
        </>
      )}
    </AdminCommandShell>
  );
}
