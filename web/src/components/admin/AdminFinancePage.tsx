"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName, adminSelectClassName, formatAdminUsd } from "@/components/admin/AdminCommandShell";
import { AdminCsvExportButton } from "@/components/admin/AdminCsvExportButton";
import { AdminMetricStrip } from "@/components/admin/AdminMetricStrip";

type Summary = {
  gmvUsd: number | null;
  platformFeesUsd: number | null;
  processingFeesUsd: number | null;
  processingFeesEstimated: boolean;
  netRevenueUsd: number | null;
  sellerPayoutsUsd: number | null;
  pendingPayoutsUsd: number | null;
  refundedOrders: number | null;
  chargebacksDisputes: number | null;
  chargebacksDisputesEstimated: boolean;
  paidOrderCount: number;
  notes: string[];
};

type ChartPoint = { label: string; gmvUsd: number; platformFeesUsd: number };

export function AdminFinancePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([
        fetch("/api/admin/finance/summary", { cache: "no-store" }),
        fetch(`/api/admin/finance/charts?period=${period}`, { cache: "no-store" }),
      ]);
      if (sRes.ok) setSummary((await sRes.json()) as Summary);
      if (cRes.ok) {
        const j = (await cRes.json()) as { points?: ChartPoint[] };
        setPoints(Array.isArray(j.points) ? j.points : []);
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxGmv = Math.max(1, ...points.map((p) => p.gmvUsd));

  return (
    <AdminCommandShell
      title="Financial Analytics"
      subtitle="Platform net is application fees collected on paid orders. Stripe processing is paid by sellers and shown separately for reference."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <AdminCsvExportButton report="finance-summary" label="Export summary" />
          <AdminCsvExportButton report="finance-charts" params={{ period }} label="Export charts" />
        </div>
      }
    >
      {loading && !summary ? (
        <p className="text-sm text-zinc-500">Loading finance data…</p>
      ) : (
        <>
          <AdminMetricStrip
            metrics={[
              { label: "GMV USD", value: summary?.gmvUsd ?? null, tone: "gold" },
              { label: "Platform fees USD", value: summary?.platformFeesUsd ?? null },
              {
                label: "Stripe processing (sellers)",
                value: summary?.processingFeesUsd ?? null,
                hint: summary?.processingFeesEstimated
                  ? "Estimated seller-paid Stripe (2.9% + $0.30) — not platform cost"
                  : undefined,
              },
              {
                label: "Net platform revenue USD",
                value: summary?.netRevenueUsd ?? null,
                hint: "Application fees collected — same as platform fees",
                tone: "gold",
              },
              { label: "Seller payouts USD", value: summary?.sellerPayoutsUsd ?? null },
              { label: "Pending payouts USD", value: summary?.pendingPayoutsUsd ?? null, tone: "warn" },
              { label: "Refunded layaways", value: summary?.refundedOrders ?? null },
              {
                label: "Chargebacks / disputes",
                value: summary?.chargebacksDisputes ?? null,
                hint: summary?.chargebacksDisputesEstimated ? "Seller unresolved dispute proxy" : undefined,
                tone: "warn",
              },
              { label: "Paid orders sampled", value: summary?.paidOrderCount ?? 0 },
            ]}
          />

          <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-lg font-bold">Revenue charts</h2>
            <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className={adminSelectClassName}>
              <option value="daily">Daily (14d)</option>
              <option value="weekly">Weekly (12w)</option>
              <option value="monthly">Monthly (12m)</option>
            </select>
          </div>

          <div className={`mt-4 ${adminPanelClassName} p-4`}>
            <div className="flex h-48 items-end gap-1">
              {points.map((p) => (
                <div key={p.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex w-full items-end justify-center gap-0.5" style={{ height: "10rem" }}>
                    <div
                      className="w-2 rounded-t bg-gold/70"
                      style={{ height: `${Math.max(4, (p.gmvUsd / maxGmv) * 100)}%` }}
                      title={`GMV ${formatAdminUsd(p.gmvUsd)}`}
                    />
                    <div
                      className="w-2 rounded-t bg-emerald-500/60"
                      style={{ height: `${Math.max(2, (p.platformFeesUsd / maxGmv) * 100)}%` }}
                      title={`Fees ${formatAdminUsd(p.platformFeesUsd)}`}
                    />
                  </div>
                  <span className="truncate text-[9px] text-zinc-600">{p.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-zinc-600">
              Gold = item GMV · Green = platform fees collected · Net platform revenue equals platform fees (Stripe processing is seller-paid).
            </p>
          </div>

          {summary?.notes?.length ? (
            <ul className="mt-6 space-y-1 text-xs text-zinc-500">
              {summary.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </AdminCommandShell>
  );
}
