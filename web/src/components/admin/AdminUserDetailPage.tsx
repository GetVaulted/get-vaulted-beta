"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ChecklistItem = {
  key: string;
  label: string;
  met: boolean;
  pending?: boolean;
  current?: string;
};

type Summary = {
  seller: {
    id: string;
    username: string;
    email: string;
    payoutTier: string;
    sellerLevel: string;
    sellerLevelLabel: string;
    fastPayoutStatus: string;
    instantPayoutApprovalStatus: string;
    instantPayoutApprovalLabel: string;
    instantPayoutReviewDate: string | null;
    instantPayoutReviewNotes: string | null;
    instantPayoutRejectionReason: string | null;
    suspensionReason: string | null;
    limitOverrides: { perOrderUsd: number | null; dailyUsd: number | null; exposureUsd: number | null } | null;
    platformLimits: { perOrderUsd: number; dailyUsd: number; maxOutstandingUsd: number };
    platformFeeOverride: {
      percent: number | null;
      effectivePercent: number | null;
      reason: string | null;
      setAt: string | null;
      expiresAt: string | null;
      defaultMarketplacePercent: number;
      launchPromoSlotsUsed: number;
      launchPromoSlotsMax: number;
      canAssignPromoOverride: boolean;
    };
    payoutRiskLevel?: string;
    payoutHoldDays?: number;
    payoutReservePercent?: number;
    stripePayoutsEnabled?: boolean | null;
    hasStripeAccount?: boolean;
  };
  metrics: {
    lifetimeGmvUsd: number;
    completedOrders: number;
    accountStanding: string;
    cancellationRate: number;
    chargebackRate: number;
    disputeRate: number;
    accountAgeDays: number;
    fraudStatus: string;
    unresolvedDisputeCount: number;
    excessiveShippingDelayCount: number;
    dailyInstantPayoutUsd: number;
    outstandingInstantPayoutUsd: number;
    lifetimeInstantPayoutUsd: number;
  } | null;
  tierEvaluation: {
    effectiveTier: string;
    naturalTier: string;
    suspensionReasons: string[];
    checklist: ChecklistItem[];
  } | null;
  suspensionHistory: Array<{
    id: string;
    action: string;
    reason: string | null;
    createdAt: string;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    previousStatus: string | null;
    newStatus: string | null;
    reason: string | null;
    createdAt: string;
  }>;
};

function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function formatUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function AdminUserDetailPage() {
  const params = useParams();
  const userId = typeof params?.userId === "string" ? params.userId : "";
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [overrideRequirements, setOverrideRequirements] = useState(false);
  const [perOrderLimit, setPerOrderLimit] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [exposureLimit, setExposureLimit] = useState("");
  const [platformFeePercent, setPlatformFeePercent] = useState("");
  const [platformFeeExpiresAt, setPlatformFeeExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/payout-tier`, { cache: "no-store" });
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

  const act = async (action: string, extra?: Record<string, unknown>) => {
    if (action !== "recalculate" && !reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/payout-tier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reason.trim() || "recalculate",
          reviewNotes: reviewNotes.trim() || undefined,
          rejectionReason: rejectionReason.trim() || undefined,
          overrideRequirements,
          perOrderLimitUsd: perOrderLimit ? Number(perOrderLimit) : undefined,
          dailyLimitUsd: dailyLimit ? Number(dailyLimit) : undefined,
          exposureLimitUsd: exposureLimit ? Number(exposureLimit) : undefined,
          platformFeePercent: platformFeePercent ? Number(platformFeePercent) : undefined,
          platformFeeExpiresAt: platformFeeExpiresAt.trim() || undefined,
          ...extra,
        }),
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

  const m = data.metrics;
  const limits = data.seller.platformLimits;
  const overrides = data.seller.limitOverrides;
  const feeOverride = data.seller.platformFeeOverride;
  const effectiveFeePercent = feeOverride.effectivePercent ?? feeOverride.defaultMarketplacePercent;

  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-4 lg:px-10">
      <Link href="/admin/users" className="text-xs font-semibold text-zinc-500 hover:text-gold-bright">
        ← Users
      </Link>
      <h1 className="font-display mt-4 text-xl font-black tracking-tight">Seller risk & payout program</h1>
      <p className="mt-1 text-xs text-zinc-500">
        @{data.seller.username} · {data.seller.email}
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{error}</p>
      ) : null}

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs lg:col-span-1">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Seller level</h2>
          <p className="mt-2 text-lg font-black text-gold-bright">{data.seller.sellerLevelLabel}</p>
          <p className="mt-1 text-zinc-400">
            Payout tier: <span className="capitalize text-zinc-200">{data.seller.payoutTier}</span>
          </p>
          <p className="mt-1 text-zinc-400">
            Natural: <span className="capitalize text-zinc-200">{data.tierEvaluation?.naturalTier ?? "—"}</span>
          </p>
          <p className="mt-1 text-zinc-400">
            Fast status: <span className="text-zinc-200">{data.seller.fastPayoutStatus.replace(/_/g, " ")}</span>
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs lg:col-span-1">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Instant payout workflow</h2>
          <p className="mt-2 text-base font-bold text-zinc-100">{data.seller.instantPayoutApprovalLabel}</p>
          {data.seller.instantPayoutReviewDate ? (
            <p className="mt-1 text-zinc-500">Reviewed {new Date(data.seller.instantPayoutReviewDate).toLocaleString()}</p>
          ) : null}
          {data.seller.instantPayoutReviewNotes ? (
            <p className="mt-2 text-zinc-400">Notes: {data.seller.instantPayoutReviewNotes}</p>
          ) : null}
          {data.seller.instantPayoutRejectionReason ? (
            <p className="mt-2 text-amber-200/90">Rejection: {data.seller.instantPayoutRejectionReason}</p>
          ) : null}
          {data.seller.suspensionReason ? (
            <p className="mt-2 text-[10px] text-rose-300">Suspended: {data.seller.suspensionReason}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs lg:col-span-1">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Instant exposure</h2>
          <p className="mt-2 text-zinc-300">
            Today: <span className="tabular-nums text-zinc-100">{formatUsd(m?.dailyInstantPayoutUsd ?? 0)}</span>
            <span className="text-zinc-500"> / {formatUsd(overrides?.dailyUsd ?? limits.dailyUsd)}</span>
          </p>
          <p className="mt-1 text-zinc-300">
            Outstanding:{" "}
            <span className="tabular-nums text-zinc-100">{formatUsd(m?.outstandingInstantPayoutUsd ?? 0)}</span>
            <span className="text-zinc-500"> / {formatUsd(overrides?.exposureUsd ?? limits.maxOutstandingUsd)}</span>
          </p>
          <p className="mt-1 text-zinc-300">
            Lifetime: <span className="tabular-nums text-zinc-100">{formatUsd(m?.lifetimeInstantPayoutUsd ?? 0)}</span>
          </p>
          <p className="mt-2 text-zinc-500">
            Per-order limit: {formatUsd(overrides?.perOrderUsd ?? limits.perOrderUsd)}
          </p>
        </div>
      </section>

      {m ? (
        <section className="mt-4 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Risk metrics</h2>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <p className="text-zinc-300">
              Lifetime GMV: <span className="tabular-nums text-zinc-100">${m.lifetimeGmvUsd.toLocaleString()}</span>
            </p>
            <p className="text-zinc-300">
              Completed orders: <span className="tabular-nums text-zinc-100">{m.completedOrders}</span>
            </p>
            <p className="text-zinc-300">
              Account standing: <span className="capitalize text-zinc-100">{m.accountStanding.replace(/_/g, " ")}</span>
            </p>
            <p className="text-zinc-300">
              Account age: <span className="text-zinc-100">{m.accountAgeDays}d</span>
            </p>
            <p className="text-zinc-300">
              Cancellation: <span className="text-zinc-100">{pct(m.cancellationRate)}</span>
            </p>
            <p className="text-zinc-300">
              Chargeback: <span className="text-zinc-100">{pct(m.chargebackRate)}</span>
            </p>
            <p className="text-zinc-300">
              Dispute: <span className="text-zinc-100">{pct(m.disputeRate)}</span>
            </p>
            <p className="text-zinc-300">
              Fraud: <span className="capitalize text-zinc-100">{m.fraudStatus}</span>
            </p>
          </div>
        </section>
      ) : null}

      {data.tierEvaluation?.checklist?.length ? (
        <section className="mt-4 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Eligibility checklist</h2>
          <ul className="mt-2 space-y-1">
            {data.tierEvaluation.checklist.map((item) => (
              <li key={item.key} className="text-zinc-300">
                {item.met ? "✓" : item.pending ? "◷" : "○"} {item.label}
                {item.current ? ` · ${item.current}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
        <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Launch promo fee (per seller)</h2>
        <p className="mt-2 text-zinc-400">
          Only sellers you manually enroll get a reduced fee. Everyone else keeps the platform default.
        </p>
        <p className="mt-1 text-zinc-300">
          Launch promo slots:{" "}
          <span className="font-semibold text-zinc-100">
            {feeOverride.launchPromoSlotsUsed}/{feeOverride.launchPromoSlotsMax}
          </span>{" "}
          active
        </p>
        <p className="mt-2 text-zinc-300">
          Effective fee:{" "}
          <span className="font-semibold text-gold-bright">{effectiveFeePercent}%</span>
          {feeOverride.effectivePercent != null ? (
            <span className="text-zinc-500"> (override active)</span>
          ) : (
            <span className="text-zinc-500"> (platform default {feeOverride.defaultMarketplacePercent}%)</span>
          )}
        </p>
        {feeOverride.effectivePercent != null ? (
          <>
            <p className="mt-1 text-zinc-400">
              Stored override: {feeOverride.percent}% · {feeOverride.reason ?? "No reason recorded"}
            </p>
            {feeOverride.expiresAt ? (
              <p className="mt-1 text-zinc-400">Expires: {new Date(feeOverride.expiresAt).toLocaleString()}</p>
            ) : null}
          </>
        ) : feeOverride.percent != null ? (
          <p className="mt-1 text-amber-200">Override is set but expired — seller uses platform default.</p>
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            type="number"
            min={0}
            max={25}
            step={0.01}
            placeholder={`Fee % (default ${feeOverride.defaultMarketplacePercent})`}
            value={platformFeePercent}
            onChange={(e) => setPlatformFeePercent(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
          />
          <input
            type="datetime-local"
            placeholder="Optional expiry"
            value={platformFeeExpiresAt}
            onChange={(e) => setPlatformFeeExpiresAt(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
          />
        </div>
        <p className="mt-2 text-[10px] text-zinc-500">
          Applies to marketplace and live sales for this seller only (0–25%). Max {feeOverride.launchPromoSlotsMax}{" "}
          launch promos at once.
        </p>
        {!feeOverride.canAssignPromoOverride ? (
          <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-950/30 px-3 py-2 text-amber-100">
            All {feeOverride.launchPromoSlotsMax} launch promo slots are in use. Clear one before enrolling another
            seller.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !platformFeePercent.trim() || !feeOverride.canAssignPromoOverride}
            onClick={() => void act("override_platform_fee")}
            className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-[10px] font-semibold text-gold-bright disabled:opacity-50"
          >
            Set fee override
          </button>
          <button
            type="button"
            disabled={busy || feeOverride.percent == null}
            onClick={() => void act("clear_platform_fee_override")}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-semibold text-zinc-200 disabled:opacity-50"
          >
            Clear override
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
        <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Admin controls</h2>
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Reason (required)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
            placeholder="Document why this action is taken…"
          />
        </label>
        <label className="mt-2 flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Review / approval notes</span>
          <textarea
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            rows={2}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
          />
        </label>
        <label className="mt-2 flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Rejection reason</span>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={2}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
          />
        </label>
        <label className="mt-2 flex items-center gap-2 text-zinc-400">
          <input
            type="checkbox"
            checked={overrideRequirements}
            onChange={(e) => setOverrideRequirements(e.target.checked)}
          />
          Override eligibility requirements on approval
        </label>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            type="number"
            placeholder={`Per-order ($${limits.perOrderUsd})`}
            value={perOrderLimit}
            onChange={(e) => setPerOrderLimit(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
          />
          <input
            type="number"
            placeholder={`Daily ($${limits.dailyUsd})`}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
          />
          <input
            type="number"
            placeholder={`Exposure ($${limits.maxOutstandingUsd})`}
            value={exposureLimit}
            onChange={(e) => setExposureLimit(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("start_instant_review")}
            className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[10px] font-semibold text-sky-200 disabled:opacity-50"
          >
            Start Review
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("approve_instant_payout")}
            className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-[10px] font-semibold text-gold-bright disabled:opacity-50"
          >
            Approve Instant Payout
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("reject_instant_payout")}
            className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-[10px] font-semibold text-amber-200 disabled:opacity-50"
          >
            Reject Application
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("suspend_instant_payout")}
            className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-[10px] font-semibold text-rose-300 disabled:opacity-50"
          >
            Suspend Instant Payout
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("restore_instant_payout")}
            className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-[10px] font-semibold text-emerald-200 disabled:opacity-50"
          >
            Restore Seller Status
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("override_instant_limits")}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-semibold text-zinc-200 disabled:opacity-50"
          >
            Override Limits
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("assign_elite_vault_verified")}
            className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[10px] font-semibold text-violet-200 disabled:opacity-50"
          >
            Assign Elite Vault Verified
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("remove_elite_vault_verified")}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-semibold text-zinc-200 disabled:opacity-50"
          >
            Remove Elite
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("grant_fast_payout")}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-200 disabled:opacity-50"
          >
            Grant Fast Payout
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("recalculate")}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-semibold text-zinc-200 disabled:opacity-50"
          >
            Recalculate tier
          </button>
        </div>
      </section>

      {data.suspensionHistory.length > 0 ? (
        <section className="mt-6 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Suspension history</h2>
          <ul className="mt-3 space-y-2">
            {data.suspensionHistory.map((l) => (
              <li key={l.id} className="border-b border-white/[0.05] pb-2 text-[10px] text-zinc-400">
                <span className="font-mono text-zinc-300">{l.action}</span>
                {l.reason ? <span className="block text-zinc-500">{l.reason}</span> : null}
                <span className="block text-zinc-600">{new Date(l.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.auditLogs.length > 0 ? (
        <section className="mt-6 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Audit log</h2>
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
