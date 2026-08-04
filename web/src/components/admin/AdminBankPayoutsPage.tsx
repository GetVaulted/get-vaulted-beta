"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName, formatAdminUsd } from "@/components/admin/AdminCommandShell";

type SellerOrder = {
  orderId: string;
  itemTitle: string;
  estimatedNetUsd: number;
  shippedAt: string | null;
  payoutStatus: string;
};

type SellerRow = {
  sellerId: string;
  username: string | null;
  email: string | null;
  stripeAccountId: string | null;
  orderCount: number;
  owedUsd: number;
  availableUsd: number | null;
  pendingUsd: number | null;
  pushableUsd: number;
  blockedReason: string | null;
  orders: SellerOrder[];
};

type Payload = {
  sellers: SellerRow[];
  sellerCount: number;
  orderCount: number;
};

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatAdminUsd(n) ?? `$${n.toFixed(2)}`;
}

function blockedLabel(reason: string | null): string | null {
  if (!reason) return null;
  if (reason === "no_stripe_account") return "No Stripe account";
  if (reason === "stripe_onboarding_incomplete") return "Onboarding incomplete";
  if (reason === "stripe_payouts_disabled") return "Payouts disabled";
  if (reason === "stripe_not_configured") return "Stripe not configured";
  if (reason.startsWith("stripe_balance_error:")) return "Could not load Connect balance";
  return reason;
}

export function AdminBankPayoutsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySellerId, setBusySellerId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reason, setReason] = useState("Admin seller bank payout release");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  const syncStripe = async () => {
    setSyncing(true);
    setError(null);
    setNote(null);
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
        matchedFromConnectShortfall?: number;
        sellersScanned?: number;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Sync failed.");
        return;
      }
      const healed =
        (j.healedLocal ?? 0) +
        (j.matchedFromStripe ?? 0) +
        (j.matchedBulkFromBalance ?? 0) +
        (j.matchedFromConnectShortfall ?? 0);
      setNote(
        healed > 0
          ? `Synced ${healed} already-paid order${healed === 1 ? "" : "s"} off the queue (scanned ${j.sellersScanned ?? 0} sellers).`
          : `Queue matches Connect balances (${j.sellersScanned ?? 0} sellers scanned).`,
      );
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const pushSeller = async (seller: SellerRow) => {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    if (seller.pushableUsd < 0.01) return;
    setBusySellerId(seller.sellerId);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/payouts/release-seller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: seller.sellerId, reason: reason.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        pushed?: number;
        skipped?: number;
        failed?: number;
        totalPaidUsd?: number;
        remainingAvailableUsd?: number | null;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Push failed.");
        return;
      }
      const handle = seller.username?.trim() || seller.sellerId.slice(0, 8);
      setNote(
        `Pushed ${j.pushed ?? 0} order${(j.pushed ?? 0) === 1 ? "" : "s"} for @${handle}` +
          ` · paid ${money(j.totalPaidUsd ?? 0)}` +
          ((j.skipped ?? 0) > 0 ? ` · skipped ${j.skipped} (over available)` : "") +
          ((j.failed ?? 0) > 0 ? ` · failed ${j.failed}` : "") +
          (j.remainingAvailableUsd != null
            ? ` · Connect left ${money(j.remainingAvailableUsd)}`
            : ""),
      );
      await load();
    } finally {
      setBusySellerId(null);
    }
  };

  const markSellerAlreadyPaid = async (seller: SellerRow) => {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    const handle = seller.username?.trim() || seller.sellerId.slice(0, 8);
    if (
      !window.confirm(
        `Mark all ${seller.orderCount} ready order${seller.orderCount === 1 ? "" : "s"} for @${handle} as already bank-paid?\n\nUse when Connect already paid them and Sync did not clear the queue.`,
      )
    ) {
      return;
    }
    setBusySellerId(`mark:${seller.sellerId}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/payouts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_seller_already_paid",
          sellerId: seller.sellerId,
          reason: reason.trim() || "Already paid — admin override",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; marked?: number };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not mark paid.");
        return;
      }
      setNote(`Marked ${j.marked ?? seller.orderCount} order(s) for @${handle} as already paid.`);
      await load();
    } finally {
      setBusySellerId(null);
    }
  };

  const totalOwed = data?.sellers.reduce((s, r) => s + r.owedUsd, 0) ?? 0;
  const totalPushable = data?.sellers.reduce((s, r) => s + r.pushableUsd, 0) ?? 0;

  return (
    <AdminCommandShell
      title="Bank payouts"
      subtitle="Seller Connect balances only — Push never pays more than available."
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
        <p className="text-sm text-zinc-500">Loading seller payout queue…</p>
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
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Owed</p>
                <p className="mt-1 font-display text-3xl font-black text-foreground">{money(totalOwed)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Pushable</p>
                <p className="mt-1 font-display text-3xl font-black text-emerald-200">
                  {money(totalPushable)}
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
            Owed = ready order nets. Available = live Connect balance. Pushable = min(owed,
            available). Push pays oldest orders first and stops before overdrawing Connect.
            {data ? ` · ${data.orderCount} ready order${data.orderCount === 1 ? "" : "s"}` : ""}
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
            <p className="text-sm text-zinc-500">No Stripe sellers waiting for a bank payout.</p>
          ) : (
            <div className={`${adminPanelClassName} overflow-x-auto`}>
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-3 font-bold">Seller</th>
                    <th className="px-3 py-3 font-bold">Orders</th>
                    <th className="px-3 py-3 font-bold">Owed</th>
                    <th className="px-3 py-3 font-bold">Available</th>
                    <th className="px-3 py-3 font-bold">Pending</th>
                    <th className="px-3 py-3 font-bold">Pushable</th>
                    <th className="px-4 py-3 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sellers.map((s) => {
                    const handle = s.username?.trim() || s.sellerId.slice(0, 8);
                    const isOpen = Boolean(expanded[s.sellerId]);
                    const block = blockedLabel(s.blockedReason);
                    const canPush = s.pushableUsd >= 0.01 && !block;
                    const busy = busySellerId === s.sellerId || busySellerId === `mark:${s.sellerId}`;
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
                            {block ? (
                              <p className="mt-0.5 text-[11px] text-amber-200/90">{block}</p>
                            ) : null}
                            {s.owedUsd > (s.availableUsd ?? 0) + 5 && s.availableUsd != null ? (
                              <p className="mt-0.5 text-[11px] text-zinc-500">
                                Owed exceeds available — Sync or Mark already paid for the gap.
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 font-mono text-zinc-200">{s.orderCount}</td>
                          <td className="px-3 py-3 font-mono text-zinc-100">{money(s.owedUsd)}</td>
                          <td className="px-3 py-3 font-mono text-zinc-100">{money(s.availableUsd)}</td>
                          <td className="px-3 py-3 font-mono text-zinc-400">{money(s.pendingUsd)}</td>
                          <td className="px-3 py-3 font-mono text-emerald-200">{money(s.pushableUsd)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={!canPush || busy}
                                onClick={() => void pushSeller(s)}
                                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 disabled:opacity-40"
                              >
                                {busySellerId === s.sellerId ? "Pushing…" : "Push payouts"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  setExpanded((prev) => ({
                                    ...prev,
                                    [s.sellerId]: !prev[s.sellerId],
                                  }))
                                }
                                className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200"
                              >
                                {isOpen ? "Hide" : "Orders"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void markSellerAlreadyPaid(s)}
                                className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[11px] font-semibold text-amber-100/90 disabled:opacity-40"
                              >
                                {busySellerId === `mark:${s.sellerId}` ? "Saving…" : "Already paid"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className="border-b border-white/[0.06] bg-black/20">
                            <td colSpan={7} className="px-4 py-3">
                              <ul className="divide-y divide-white/[0.05]">
                                {s.orders.map((o) => (
                                  <li
                                    key={o.orderId}
                                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                                  >
                                    <div className="min-w-0">
                                      <Link
                                        href={`/admin/orders/${encodeURIComponent(o.orderId)}`}
                                        className="text-zinc-200 hover:text-gold-bright"
                                      >
                                        {o.itemTitle}
                                      </Link>
                                      <p className="text-[11px] text-zinc-500">
                                        {o.orderId.slice(0, 10)}… · {o.payoutStatus.replace(/_/g, " ")}
                                        {o.shippedAt
                                          ? ` · shipped ${new Date(o.shippedAt).toLocaleString()}`
                                          : ""}
                                      </p>
                                    </div>
                                    <span className="font-mono text-zinc-300">
                                      {money(o.estimatedNetUsd)}
                                    </span>
                                  </li>
                                ))}
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
