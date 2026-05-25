"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Summary = {
  seller: {
    id: string;
    username: string;
    email: string;
    instantPayoutEligible: boolean;
    instantPayoutStatus: string;
    instantPayoutOverrideByAdmin: boolean;
    instantPayoutOverrideReason: string | null;
    instantPayoutOverrideAt: string | null;
    payoutRiskLevel: string;
    payoutHoldDays: number;
    payoutReservePercent: number;
    stripePayoutsEnabled: boolean | null;
    hasStripeAccount: boolean;
  };
  evaluation: {
    eligible: boolean;
    status: string;
    requirementsMet: string[];
    requirementsFailed: string[];
    trackingComplianceRate: number | null;
    disputeRefundRate: number | null;
  };
  stats: {
    recentPaidOrders: number;
    ordersWithTracking: number;
    disputedOrRefundedCount: number;
    trackingComplianceRate: number | null;
    disputeRefundRate: number | null;
  };
  auditLogs: Array<{
    id: string;
    action: string;
    previousStatus: string | null;
    newStatus: string | null;
    reason: string | null;
    createdAt: string;
  }>;
};

export function AdminUserDetailPage() {
  const params = useParams();
  const userId = typeof params?.userId === "string" ? params.userId : "";
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/instant-payout`, { cache: "no-store" });
      if (!res.ok) {
        setData(null);
        return;
      }
      setData((await res.json()) as Summary);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: string) => {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/instant-payout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Action failed.");
        return;
      }
      setReason("");
      await load();
    } finally {
      setBusy(false);
    }
  };

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
        <p className="text-sm text-zinc-500">User not found.</p>
        <Link href="/admin/users" className="mt-4 inline-block text-xs font-semibold text-gold-bright hover:underline">
          ← Users
        </Link>
      </main>
    );
  }

  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-4 lg:px-10">
      <Link href="/admin/users" className="text-xs font-semibold text-zinc-500 hover:text-gold-bright">
        ← Users
      </Link>
      <h1 className="font-display mt-4 text-xl font-black tracking-tight">Seller payout controls</h1>
      <p className="mt-1 text-xs text-zinc-500">
        @{data.seller.username} · {data.seller.email}
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{error}</p>
      ) : null}

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Instant payout status</h2>
          <p className="mt-2 capitalize text-zinc-100">{data.seller.instantPayoutStatus.replace(/_/g, " ")}</p>
          <p className="mt-1 text-zinc-400">
            Eligible: <span className="text-zinc-200">{data.seller.instantPayoutEligible ? "Yes" : "No"}</span>
          </p>
          <p className="mt-1 text-zinc-400">
            Risk level: <span className="capitalize text-zinc-200">{data.seller.payoutRiskLevel}</span>
          </p>
          <p className="mt-1 text-zinc-400">
            Stripe payouts:{" "}
            <span className="text-zinc-200">
              {data.seller.hasStripeAccount ? (data.seller.stripePayoutsEnabled === false ? "Disabled" : "Ready") : "Not connected"}
            </span>
          </p>
          {data.seller.instantPayoutOverrideReason ? (
            <p className="mt-2 text-[10px] text-zinc-500">
              Override: {data.seller.instantPayoutOverrideReason}
              {data.seller.instantPayoutOverrideAt
                ? ` · ${new Date(data.seller.instantPayoutOverrideAt).toLocaleString()}`
                : ""}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Compliance summary (90d)</h2>
          <p className="mt-2 text-zinc-300">
            Paid orders: <span className="tabular-nums text-zinc-100">{data.stats.recentPaidOrders}</span>
          </p>
          <p className="mt-1 text-zinc-300">
            Tracking compliance: <span className="text-zinc-100">{pct(data.stats.trackingComplianceRate)}</span>
          </p>
          <p className="mt-1 text-zinc-300">
            Dispute/refund rate: <span className="text-zinc-100">{pct(data.stats.disputeRefundRate)}</span>
          </p>
          <p className="mt-1 text-zinc-300">
            Disputes/refunds: <span className="tabular-nums text-zinc-100">{data.stats.disputedOrRefundedCount}</span>
          </p>
          <p className="mt-1 text-zinc-300">
            Hold days / reserve:{" "}
            <span className="text-zinc-100">
              {data.seller.payoutHoldDays}d / {data.seller.payoutReservePercent}%
            </span>
          </p>
        </div>
      </section>

      {data.evaluation.requirementsFailed.length > 0 ? (
        <section className="mt-4 rounded-xl border border-amber-400/20 bg-amber-950/20 p-4 text-xs">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Failed requirements</h2>
          <ul className="mt-2 list-inside list-disc text-amber-100/90">
            {data.evaluation.requirementsFailed.map((r) => (
              <li key={r}>{r.replace(/_/g, " ")}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
        <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Override actions</h2>
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Reason (required)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
            placeholder="Document why this override is applied…"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("enable_instant_payout")}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
          >
            Enable instant payout
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("disable_instant_payout")}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-semibold text-zinc-200 hover:border-gold/30 disabled:opacity-50"
          >
            Disable instant payout
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("suspend_instant_payout")}
            className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Suspend instant payout
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("require_manual_review")}
            className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
          >
            Require manual review
          </button>
        </div>
      </section>

      {data.auditLogs.length > 0 ? (
        <section className="mt-6 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Recent audit log</h2>
          <ul className="mt-3 space-y-2">
            {data.auditLogs.map((l) => (
              <li key={l.id} className="border-b border-white/[0.05] pb-2 text-[10px] text-zinc-400">
                <span className="font-mono text-zinc-300">{l.action}</span>
                {l.previousStatus || l.newStatus ? (
                  <span>
                    {" "}
                    · {l.previousStatus ?? "—"} → {l.newStatus ?? "—"}
                  </span>
                ) : null}
                {l.reason ? <span className="block text-zinc-500">{l.reason}</span> : null}
                <span className="block text-zinc-600">{new Date(l.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
