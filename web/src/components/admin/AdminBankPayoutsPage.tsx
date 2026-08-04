"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminCommandShell, adminPanelClassName, formatAdminUsd } from "@/components/admin/AdminCommandShell";

type ReadyRow = {
  orderId: string;
  sellerId: string;
  sellerUsername: string | null;
  sellerEmail: string | null;
  itemTitle: string;
  itemPriceUsd: number;
  estimatedNetUsd: number;
  payoutStatus: string;
  shippedAt: string | null;
  carrierAcceptedAt: string | null;
  labelCostCents: number;
  labelReversedCents: number;
  liveShippingSessionId: string | null;
  createdAt: string;
};

type Payload = { count: number; orders: ReadyRow[] };

function money(n: number) {
  return formatAdminUsd(n) ?? `$${n.toFixed(2)}`;
}

export function AdminBankPayoutsPage() {
  const search = useSearchParams();
  const highlightOrderId = search.get("orderId")?.trim() || null;
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [reason, setReason] = useState("Admin bank payout release");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payouts/ready", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load payout queue.");
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

  const bySeller = useMemo(() => {
    const map = new Map<string, { seller: ReadyRow; orders: ReadyRow[]; netUsd: number }>();
    for (const o of data?.orders ?? []) {
      const cur = map.get(o.sellerId);
      if (!cur) {
        map.set(o.sellerId, { seller: o, orders: [o], netUsd: o.estimatedNetUsd });
      } else {
        cur.orders.push(o);
        cur.netUsd += o.estimatedNetUsd;
      }
    }
    return [...map.values()].sort((a, b) => b.netUsd - a.netUsd);
  }, [data?.orders]);

  const syncStripe = async () => {
    setSyncing(true);
    setError(null);
    setSyncNote(null);
    try {
      const res = await fetch("/api/admin/payouts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        healedLocal?: number;
        matchedFromStripe?: number;
        matchedBulkFromBalance?: number;
        sellersScanned?: number;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Sync failed.");
        return;
      }
      const healed =
        (j.healedLocal ?? 0) + (j.matchedFromStripe ?? 0) + (j.matchedBulkFromBalance ?? 0);
      const bulk = j.matchedBulkFromBalance ?? 0;
      setSyncNote(
        healed > 0
          ? `Synced ${healed} already-paid order${healed === 1 ? "" : "s"} off the queue` +
              (bulk > 0 ? ` (${bulk} via emptied Connect / Dashboard bulk payout)` : "") +
              ` — scanned ${j.sellersScanned ?? 0} sellers.`
          : `No changes — queue already matches Stripe bank payouts (${j.sellersScanned ?? 0} sellers scanned).`,
      );
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const release = async (orderId: string) => {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setBusyId(orderId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release_payout", reason: reason.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Release failed.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const markAlreadyPaid = async (orderId: string) => {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    if (
      !window.confirm(
        "Mark this order as already bank-paid? Use this when Stripe/Dashboard already paid the seller and the queue is stale.",
      )
    ) {
      return;
    }
    setBusyId(`mark:${orderId}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_already_paid",
          reason: reason.trim() || "Already paid — admin sync",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not mark paid.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const markSellerAlreadyPaid = async (sellerId: string, username: string | null, orderCount: number) => {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    const handle = username?.trim() || sellerId.slice(0, 8);
    if (
      !window.confirm(
        `Mark all ${orderCount} ready order${orderCount === 1 ? "" : "s"} for @${handle} as already bank-paid?\n\nUse when Stripe Dashboard already paid this seller’s Connect balance (bulk payout with no per-order metadata).`,
      )
    ) {
      return;
    }
    setBusyId(`seller:${sellerId}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/payouts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_seller_already_paid",
          sellerId,
          reason: reason.trim() || "Already paid — Dashboard bulk bank payout",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; marked?: number };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not mark seller paid.");
        return;
      }
      setSyncNote(`Marked ${j.marked ?? orderCount} order(s) for @${handle} as already paid.`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminCommandShell
      title="Bank payouts"
      subtitle="Stripe sellers whose orders are shipped and label-settled — push Connect bank payouts here so you don’t forget."
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void syncStripe()}
            disabled={syncing}
            className="rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 disabled:opacity-50 hover:bg-sky-500/15"
          >
            {syncing ? "Syncing…" : "Sync with Stripe"}
          </button>
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
        <p className="text-sm text-zinc-500">Loading payout queue…</p>
      ) : (
        <>
          <div className={`${adminPanelClassName} mb-6 flex flex-wrap items-end justify-between gap-3 p-4`}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Ready to push</p>
              <p className="mt-1 font-display text-3xl font-black text-foreground">{data?.count ?? 0}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Funds are held on Connect until you release. Label clawback already ran. Sync also
                clears sellers paid via Stripe Dashboard bulk payouts (empty Connect + covering
                payouts). Use Mark all already paid if Sync still misses them.
              </p>
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

          {syncNote ? (
            <p className="mb-4 rounded-lg border border-sky-400/25 bg-sky-950/30 px-3 py-2 text-sm text-sky-100">
              {syncNote}
            </p>
          ) : null}

          {error ? (
            <p className="mb-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          {bySeller.length === 0 ? (
            <p className="text-sm text-zinc-500">No Stripe orders waiting for a bank payout.</p>
          ) : (
            <div className="space-y-4">
              {bySeller.map(({ seller, orders, netUsd }) => (
                <section key={seller.sellerId} className={`${adminPanelClassName} p-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link
                        href={`/admin/users/${encodeURIComponent(seller.sellerId)}`}
                        className="font-semibold text-gold-bright hover:underline"
                      >
                        @{seller.sellerUsername?.trim() || seller.sellerId.slice(0, 8)}
                      </Link>
                      {seller.sellerEmail ? (
                        <p className="text-xs text-zinc-500">{seller.sellerEmail}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm text-emerald-200">
                        {orders.length} order{orders.length === 1 ? "" : "s"} · {money(netUsd)}
                      </p>
                      <button
                        type="button"
                        disabled={busyId === `seller:${seller.sellerId}`}
                        onClick={() =>
                          void markSellerAlreadyPaid(
                            seller.sellerId,
                            seller.sellerUsername,
                            orders.length,
                          )
                        }
                        className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 disabled:opacity-50 hover:bg-amber-500/15"
                      >
                        {busyId === `seller:${seller.sellerId}`
                          ? "Saving…"
                          : "Mark all already paid"}
                      </button>
                    </div>
                  </div>
                  <ul className="mt-3 divide-y divide-white/[0.06]">
                    {orders.map((o) => {
                      const highlighted = highlightOrderId === o.orderId;
                      return (
                        <li
                          key={o.orderId}
                          className={`flex flex-wrap items-center justify-between gap-3 py-3 ${
                            highlighted ? "rounded-lg bg-emerald-500/10 px-2" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/admin/orders/${encodeURIComponent(o.orderId)}`}
                              className="truncate text-sm font-medium text-zinc-100 hover:text-gold-bright"
                            >
                              {o.itemTitle}
                            </Link>
                            <p className="mt-0.5 text-[11px] text-zinc-500">
                              {o.orderId.slice(0, 10)}… · {o.payoutStatus.replace(/_/g, " ")} · shipped{" "}
                              {o.shippedAt || o.carrierAcceptedAt
                                ? new Date(o.shippedAt ?? o.carrierAcceptedAt!).toLocaleString()
                                : "—"}
                              {o.labelCostCents > 0
                                ? ` · label $${(o.labelReversedCents / 100).toFixed(2)}`
                                : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm text-zinc-200">{money(o.estimatedNetUsd)}</span>
                            <button
                              type="button"
                              disabled={busyId === o.orderId}
                              onClick={() => void release(o.orderId)}
                              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 disabled:opacity-50"
                            >
                              {busyId === o.orderId ? "Pushing…" : "Push payout"}
                            </button>
                            <button
                              type="button"
                              disabled={busyId === `mark:${o.orderId}`}
                              onClick={() => void markAlreadyPaid(o.orderId)}
                              className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                            >
                              {busyId === `mark:${o.orderId}` ? "Saving…" : "Already paid"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </AdminCommandShell>
  );
}
