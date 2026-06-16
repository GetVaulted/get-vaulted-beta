"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";

type FeesPayload = {
  marketplace: { platformFeePercent: number; note: string };
  liveSelling: {
    tiers: Array<{ label: string; thresholdUsd: number; feePercent: number }>;
    note: string;
  };
  payoutProgram: {
    thresholds: {
      fast: { minAccountAgeDays: number; minLifetimeGmvUsd: number; minCompletedOrders: number };
      instant: Record<string, number>;
    };
    instantLimits: { perOrderUsd: number; dailyUsd: number; maxOutstandingUsd: number };
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

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/fees", { cache: "no-store" });
        if (res.ok) setData((await res.json()) as FeesPayload);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AdminCommandShell
      title="Get Vaulted Rates & Fee Settings"
      subtitle="Read-only view of current platform constants. Editable admin settings API is not wired yet."
      actions={
        <Link href="/admin/seller-risk" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]">
          Seller payout review →
        </Link>
      }
    >
      {loading ? (
        <p className="text-sm text-zinc-500">Loading fee policy…</p>
      ) : data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${adminPanelClassName} p-5`}>
            <h2 className="text-sm font-bold text-gold-bright">Marketplace</h2>
            <div className="mt-4">
              <SettingRow label="Platform fee rate" value={`${data.marketplace.platformFeePercent}%`} detail={data.marketplace.note} />
            </div>
          </section>

          <section className={`${adminPanelClassName} p-5`}>
            <h2 className="text-sm font-bold text-gold-bright">Live selling fee tiers</h2>
            <div className="mt-4">
              {data.liveSelling.tiers.map((t) => (
                <SettingRow
                  key={t.label}
                  label={`${t.label} tier (≥ $${t.thresholdUsd.toLocaleString()})`}
                  value={`${t.feePercent}%`}
                />
              ))}
              <p className="mt-3 text-xs text-zinc-600">{data.liveSelling.note}</p>
            </div>
          </section>

          <section className={`${adminPanelClassName} p-5`}>
            <h2 className="text-sm font-bold text-gold-bright">Seller payout program</h2>
            <div className="mt-4 space-y-0">
              <SettingRow
                label="Fast payout — min account age"
                value={`${data.payoutProgram.thresholds.fast.minAccountAgeDays} days`}
              />
              <SettingRow
                label="Fast payout — min lifetime GMV"
                value={`$${data.payoutProgram.thresholds.fast.minLifetimeGmvUsd.toLocaleString()}`}
              />
              <SettingRow
                label="Fast payout — min completed orders"
                value={String(data.payoutProgram.thresholds.fast.minCompletedOrders)}
              />
              <SettingRow
                label="Instant — max cancellation rate"
                value={`${((data.payoutProgram.thresholds.instant.maxCancellationRate ?? 0) * 100).toFixed(1)}%`}
              />
              <SettingRow label="Instant per-order limit" value={`$${data.payoutProgram.instantLimits.perOrderUsd}`} />
              <SettingRow label="Instant daily limit" value={`$${data.payoutProgram.instantLimits.dailyUsd}`} />
              <SettingRow label="Instant exposure limit" value={`$${data.payoutProgram.instantLimits.maxOutstandingUsd}`} />
              <p className="mt-3 text-xs text-zinc-600">{data.payoutProgram.note}</p>
            </div>
          </section>

          <section className={`${adminPanelClassName} p-5`}>
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
      ) : (
        <p className="text-sm text-rose-400">Could not load fee settings.</p>
      )}
    </AdminCommandShell>
  );
}
