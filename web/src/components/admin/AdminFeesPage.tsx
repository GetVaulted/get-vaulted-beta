"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";

type LiveShowFeeConfig = {
  tier1FeePercent: number;
  tier2ThresholdUsd: number;
  tier2FeePercent: number;
  tier3ThresholdUsd: number;
  tier3FeePercent: number;
};

type PayoutProgramDraft = {
  thresholds: {
    fast: { minAccountAgeDays: number; minLifetimeGmvUsd: number; minCompletedOrders: number };
    instant: {
      minAccountAgeDays: number;
      minLifetimeGmvUsd: number;
      maxCancellationRate: number;
      maxChargebackRate: number;
      maxDisputeRate: number;
      maxUnresolvedDisputes: number;
    };
  };
  instantLimits: {
    perOrderUsd: number;
    dailyUsd: number;
    maxDailyCount: number;
    maxOutstandingUsd: number;
  };
  instantSuspensionRateCeiling: number;
};

type FeesPayload = {
  marketplace: {
    platformFeePercent: number;
    feeRateLabel: string;
    defaultPlatformFeePercent: number;
    editable: boolean;
    updatedAt: string | null;
    note: string;
  };
  liveSelling: {
    tiers: Array<{ label: string; thresholdUsd: number; feePercent: number }>;
    config: LiveShowFeeConfig;
    editable: boolean;
    updatedAt: string | null;
    note: string;
  };
  payoutProgram: {
    config: PayoutProgramDraft;
    thresholds: PayoutProgramDraft["thresholds"];
    instantLimits: PayoutProgramDraft["instantLimits"];
    instantSuspensionRateCeiling: number;
    editable: boolean;
    updatedAt: string | null;
    note: string;
  };
  layaway: {
    minListingPriceUsd: number;
    depositPercent: number;
    planDurationsDays: Record<string, number>;
    note: string;
  };
};

function SettingRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.04] py-3 last:border-0">
      <div>
        <p className="text-sm font-semibold text-zinc-200">{label}</p>
        {detail ? <p className="mt-1 text-xs text-zinc-600">{detail}</p> : null}
      </div>
      <p className="font-mono text-sm text-gold-bright">{value}</p>
    </div>
  );
}

export function AdminFeesPage() {
  const [data, setData] = useState<FeesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [feeDraft, setFeeDraft] = useState("");
  const [liveDraft, setLiveDraft] = useState<LiveShowFeeConfig | null>(null);
  const [payoutDraft, setPayoutDraft] = useState<PayoutProgramDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingLive, setSavingLive] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveLiveError, setSaveLiveError] = useState<string | null>(null);
  const [savePayoutError, setSavePayoutError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saveLiveOk, setSaveLiveOk] = useState<string | null>(null);
  const [savePayoutOk, setSavePayoutOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/fees", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as FeesPayload;
        setData(json);
        setFeeDraft(String(json.marketplace.platformFeePercent));
        setLiveDraft(json.liveSelling.config);
        setPayoutDraft(json.payoutProgram.config);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveMarketplaceFee = async () => {
    setSaveError(null);
    setSaveOk(null);
    const n = Number(feeDraft.trim());
    if (!Number.isFinite(n) || n < 0 || n > 6.75) {
      setSaveError("Enter a fee between 0 and 6.75.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/fees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplacePlatformFeePercent: n }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; marketplace?: { platformFeePercent: number } };
      if (!res.ok) {
        setSaveError(typeof body.error === "string" ? body.error : "Could not save marketplace fee.");
        return;
      }
      setSaveOk(`Marketplace fee updated to ${body.marketplace?.platformFeePercent ?? n}%.`);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const saveLiveFees = async () => {
    if (!liveDraft) return;
    setSaveLiveError(null);
    setSaveLiveOk(null);
    const tier2Threshold = Number(liveDraft.tier2ThresholdUsd);
    const tier3Threshold = Number(liveDraft.tier3ThresholdUsd);
    if (!Number.isFinite(tier2Threshold) || tier2Threshold < 1) {
      setSaveLiveError("Volume tier threshold must be at least $1.");
      return;
    }
    if (!Number.isFinite(tier3Threshold) || tier3Threshold <= tier2Threshold) {
      setSaveLiveError("Top tier threshold must be greater than the volume tier threshold.");
      return;
    }
    setSavingLive(true);
    try {
      const res = await fetch("/api/admin/fees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveSelling: liveDraft }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveLiveError(typeof body.error === "string" ? body.error : "Could not save live fee tiers.");
        return;
      }
      setSaveLiveOk("Live selling fee tiers updated.");
      await load();
    } finally {
      setSavingLive(false);
    }
  };

  const liveInputClassName =
    "mt-1.5 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 font-mono text-sm text-zinc-100 outline-none ring-gold/30 focus:border-gold/40 focus:ring-2";

  const savePayoutProgram = async () => {
    if (!payoutDraft) return;
    setSavePayoutError(null);
    setSavePayoutOk(null);
    setSavingPayout(true);
    try {
      const res = await fetch("/api/admin/fees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutProgram: payoutDraft }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSavePayoutError(typeof body.error === "string" ? body.error : "Could not save payout program.");
        return;
      }
      setSavePayoutOk("Seller payout program updated.");
      await load();
    } finally {
      setSavingPayout(false);
    }
  };

  return (
    <AdminCommandShell
      title="Get Vaulted Rates & Fee Settings"
      subtitle="Edit marketplace and live show platform fees live — checkout and seller consoles pick them up automatically."
      actions={
        <Link href="/admin/seller-risk" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]">
          Seller payout review →
        </Link>
      }
    >
      {loading ? (
        <p className="text-sm text-zinc-500">Loading fee policy…</p>
      ) : data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${adminPanelClassName} p-5 lg:col-span-2`}>
              <h2 className="text-sm font-bold text-gold-bright">Marketplace platform fee</h2>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">{data.marketplace.note}</p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="block min-w-[140px] flex-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Success fee (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={6.75}
                    step={0.01}
                    value={feeDraft}
                    onChange={(e) => setFeeDraft(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none ring-gold/30 focus:border-gold/40 focus:ring-2"
                  />
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveMarketplaceFee()}
                  className="rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-black disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save marketplace fee"}
                </button>
              </div>
              <p className="mt-3 text-xs text-zinc-600">
                Current: <span className="font-mono text-zinc-400">{data.marketplace.feeRateLabel}</span>
                {data.marketplace.updatedAt ? (
                  <> · Last updated {new Date(data.marketplace.updatedAt).toLocaleString()}</>
                ) : null}
              </p>
              {saveError ? <p className="mt-2 text-sm text-rose-400">{saveError}</p> : null}
              {saveOk ? <p className="mt-2 text-sm text-emerald-400">{saveOk}</p> : null}
            </section>

            <section className={`${adminPanelClassName} p-5`}>
              <h2 className="text-sm font-bold text-gold-bright">Live selling fee tiers</h2>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">{data.liveSelling.note}</p>
              {liveDraft ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Base tier (≥ $0)</p>
                    <label className="mt-2 block">
                      <span className="text-xs text-zinc-500">Fee (%)</span>
                      <input
                        type="number"
                        min={0}
                        max={6.75}
                        step={0.01}
                        value={liveDraft.tier1FeePercent}
                        onChange={(e) =>
                          setLiveDraft((prev) => (prev ? { ...prev, tier1FeePercent: Number(e.target.value) } : prev))
                        }
                        className={liveInputClassName}
                      />
                    </label>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Volume tier</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs text-zinc-500">GMV threshold ($)</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={liveDraft.tier2ThresholdUsd}
                          onChange={(e) =>
                            setLiveDraft((prev) =>
                              prev ? { ...prev, tier2ThresholdUsd: Number(e.target.value) } : prev,
                            )
                          }
                          className={liveInputClassName}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Fee (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={6.75}
                          step={0.01}
                          value={liveDraft.tier2FeePercent}
                          onChange={(e) =>
                            setLiveDraft((prev) => (prev ? { ...prev, tier2FeePercent: Number(e.target.value) } : prev))
                          }
                          className={liveInputClassName}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Top tier</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs text-zinc-500">GMV threshold ($)</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={liveDraft.tier3ThresholdUsd}
                          onChange={(e) =>
                            setLiveDraft((prev) =>
                              prev ? { ...prev, tier3ThresholdUsd: Number(e.target.value) } : prev,
                            )
                          }
                          className={liveInputClassName}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Fee (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={6.75}
                          step={0.01}
                          value={liveDraft.tier3FeePercent}
                          onChange={(e) =>
                            setLiveDraft((prev) => (prev ? { ...prev, tier3FeePercent: Number(e.target.value) } : prev))
                          }
                          className={liveInputClassName}
                        />
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingLive}
                    onClick={() => void saveLiveFees()}
                    className="rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-black disabled:opacity-50"
                  >
                    {savingLive ? "Saving…" : "Save live fee tiers"}
                  </button>
                  {data.liveSelling.updatedAt ? (
                    <p className="text-xs text-zinc-600">
                      Last updated {new Date(data.liveSelling.updatedAt).toLocaleString()}
                    </p>
                  ) : null}
                  {saveLiveError ? <p className="text-sm text-rose-400">{saveLiveError}</p> : null}
                  {saveLiveOk ? <p className="text-sm text-emerald-400">{saveLiveOk}</p> : null}
                </div>
              ) : null}
            </section>

            <section className={`${adminPanelClassName} p-5 lg:col-span-2`}>
              <h2 className="text-sm font-bold text-gold-bright">Seller payout program</h2>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">{data.payoutProgram.note}</p>
              {payoutDraft ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Fast payout (Get Vaulted)</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="text-xs text-zinc-500">Min account age (days)</span>
                        <input type="number" min={0} value={payoutDraft.thresholds.fast.minAccountAgeDays} onChange={(e) => setPayoutDraft((p) => p ? { ...p, thresholds: { ...p.thresholds, fast: { ...p.thresholds.fast, minAccountAgeDays: Number(e.target.value) } } } : p)} className={liveInputClassName} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Min lifetime GMV ($)</span>
                        <input type="number" min={0} value={payoutDraft.thresholds.fast.minLifetimeGmvUsd} onChange={(e) => setPayoutDraft((p) => p ? { ...p, thresholds: { ...p.thresholds, fast: { ...p.thresholds.fast, minLifetimeGmvUsd: Number(e.target.value) } } } : p)} className={liveInputClassName} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Min completed orders</span>
                        <input type="number" min={0} value={payoutDraft.thresholds.fast.minCompletedOrders} onChange={(e) => setPayoutDraft((p) => p ? { ...p, thresholds: { ...p.thresholds, fast: { ...p.thresholds.fast, minCompletedOrders: Number(e.target.value) } } } : p)} className={liveInputClassName} />
                      </label>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Instant eligibility (Stripe-aligned defaults)</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs text-zinc-500">Min account age (days)</span>
                        <input type="number" min={0} value={payoutDraft.thresholds.instant.minAccountAgeDays} onChange={(e) => setPayoutDraft((p) => p ? { ...p, thresholds: { ...p.thresholds, instant: { ...p.thresholds.instant, minAccountAgeDays: Number(e.target.value) } } } : p)} className={liveInputClassName} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Min lifetime GMV ($)</span>
                        <input type="number" min={0} value={payoutDraft.thresholds.instant.minLifetimeGmvUsd} onChange={(e) => setPayoutDraft((p) => p ? { ...p, thresholds: { ...p.thresholds, instant: { ...p.thresholds.instant, minLifetimeGmvUsd: Number(e.target.value) } } } : p)} className={liveInputClassName} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Max cancellation rate (%)</span>
                        <input type="number" min={0} max={100} step={0.01} value={payoutDraft.thresholds.instant.maxCancellationRate * 100} onChange={(e) => setPayoutDraft((p) => p ? { ...p, thresholds: { ...p.thresholds, instant: { ...p.thresholds.instant, maxCancellationRate: Number(e.target.value) / 100 } } } : p)} className={liveInputClassName} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Max chargeback rate (%)</span>
                        <input type="number" min={0} max={100} step={0.01} value={payoutDraft.thresholds.instant.maxChargebackRate * 100} onChange={(e) => setPayoutDraft((p) => p ? { ...p, thresholds: { ...p.thresholds, instant: { ...p.thresholds.instant, maxChargebackRate: Number(e.target.value) / 100 } } } : p)} className={liveInputClassName} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Max dispute rate (%)</span>
                        <input type="number" min={0} max={100} step={0.01} value={payoutDraft.thresholds.instant.maxDisputeRate * 100} onChange={(e) => setPayoutDraft((p) => p ? { ...p, thresholds: { ...p.thresholds, instant: { ...p.thresholds.instant, maxDisputeRate: Number(e.target.value) / 100 } } } : p)} className={liveInputClassName} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Suspension rate ceiling (%)</span>
                        <input type="number" min={0} max={100} step={0.01} value={payoutDraft.instantSuspensionRateCeiling * 100} onChange={(e) => setPayoutDraft((p) => p ? { ...p, instantSuspensionRateCeiling: Number(e.target.value) / 100 } : p)} className={liveInputClassName} />
                      </label>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3 lg:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Instant payout limits (Stripe US)</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="block">
                        <span className="text-xs text-zinc-500">Per order max ($)</span>
                        <input type="number" min={0} max={9999} value={payoutDraft.instantLimits.perOrderUsd} onChange={(e) => setPayoutDraft((p) => p ? { ...p, instantLimits: { ...p.instantLimits, perOrderUsd: Number(e.target.value) } } : p)} className={liveInputClassName} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Daily volume max ($)</span>
                        <input type="number" min={0} value={payoutDraft.instantLimits.dailyUsd} onChange={(e) => setPayoutDraft((p) => p ? { ...p, instantLimits: { ...p.instantLimits, dailyUsd: Number(e.target.value) } } : p)} className={liveInputClassName} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Max payouts per day</span>
                        <input type="number" min={1} max={100} value={payoutDraft.instantLimits.maxDailyCount} onChange={(e) => setPayoutDraft((p) => p ? { ...p, instantLimits: { ...p.instantLimits, maxDailyCount: Number(e.target.value) } } : p)} className={liveInputClassName} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-500">Max outstanding exposure ($)</span>
                        <input type="number" min={0} value={payoutDraft.instantLimits.maxOutstandingUsd} onChange={(e) => setPayoutDraft((p) => p ? { ...p, instantLimits: { ...p.instantLimits, maxOutstandingUsd: Number(e.target.value) } } : p)} className={liveInputClassName} />
                      </label>
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <button type="button" disabled={savingPayout} onClick={() => void savePayoutProgram()} className="rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-black disabled:opacity-50">
                      {savingPayout ? "Saving…" : "Save payout program"}
                    </button>
                    {data.payoutProgram.updatedAt ? (
                      <p className="mt-3 text-xs text-zinc-600">
                        Last updated {new Date(data.payoutProgram.updatedAt).toLocaleString()}
                      </p>
                    ) : null}
                    {savePayoutError ? <p className="mt-2 text-sm text-rose-400">{savePayoutError}</p> : null}
                    {savePayoutOk ? <p className="mt-2 text-sm text-emerald-400">{savePayoutOk}</p> : null}
                  </div>
                </div>
              ) : null}
            </section>

            <section className={`${adminPanelClassName} p-5 lg:col-span-2`}>
              <h2 className="text-sm font-bold text-gold-bright">Layaway settings</h2>
              <div className="mt-4">
                <SettingRow label="Minimum listing price" value={`$${data.layaway.minListingPriceUsd}`} />
                <SettingRow label="Minimum deposit" value={`${data.layaway.depositPercent}%`} />
                {Object.entries(data.layaway.planDurationsDays).map(([k, days]) => (
                  <SettingRow key={k} label={`Plan ${k.replace("_", " ")}`} value={`${days} days`} />
                ))}
                <p className="mt-3 text-xs text-zinc-600">{data.layaway.note}</p>
              </div>
            </section>
          </div>
        </>
      ) : (
        <p className="text-sm text-rose-400">Could not load fee settings.</p>
      )}
    </AdminCommandShell>
  );
}
