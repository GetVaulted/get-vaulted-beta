"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminStatusPill,
  adminPanelClassName,
  adminSelectClassName,
  adminTableClassName,
  formatAdminUsd,
} from "@/components/admin/AdminCommandShell";
import { AdminCsvExportButton } from "@/components/admin/AdminCsvExportButton";

type NexusRow = {
  stateCode: string;
  label: string;
  enabled: boolean;
  collectionBasis: string | null;
  registeredAt: string | null;
  notes: string | null;
};

type TaxSummary = {
  taxCollectedCents: number;
  taxRefundedCents: number;
  netTaxDueCents: number;
  taxableSalesCents: number;
  nonTaxableSalesCents: number;
  orderCount: number;
};

type SalesByStateRow = {
  stateCode: string;
  label: string;
  totalGmvCents: number;
  taxableSalesCents: number;
  nonTaxableSalesCents: number;
  taxCollectedCents: number;
  orderCount: number;
  collectionEnabled: boolean;
  collectionBasis: string | null;
  salesThresholdPercent: number;
  transactionThresholdPercent: number;
  nexusWatchLevel: "none" | "approaching" | "exceeded";
};

type SalesByStateReport = {
  rows: SalesByStateRow[];
  totals: {
    totalGmvCents: number;
    taxableSalesCents: number;
    nonTaxableSalesCents: number;
    taxCollectedCents: number;
    orderCount: number;
    statesWithSales: number;
  };
  thresholds: {
    salesThresholdCents: number;
    transactionThreshold: number;
    note: string;
  };
};

type DateRangeKey = "30d" | "90d" | "ytd" | "all";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function dateRangeBounds(key: DateRangeKey): { from?: string; to?: string } {
  if (key === "all") return {};
  const to = new Date();
  const from = new Date();
  if (key === "30d") {
    from.setUTCDate(from.getUTCDate() - 30);
  } else if (key === "90d") {
    from.setUTCDate(from.getUTCDate() - 90);
  } else {
    from.setUTCMonth(0, 1);
    from.setUTCHours(0, 0, 0, 0);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

function NexusWatchBadge({ row }: { row: SalesByStateRow }) {
  if (row.collectionEnabled) {
    return <AdminStatusPill tone="ok">Collecting</AdminStatusPill>;
  }
  if (row.totalGmvCents === 0 && row.orderCount === 0) {
    return <AdminStatusPill tone="neutral">No sales</AdminStatusPill>;
  }
  if (row.nexusWatchLevel === "exceeded") {
    return <AdminStatusPill tone="bad">Review nexus</AdminStatusPill>;
  }
  if (row.nexusWatchLevel === "approaching") {
    return <AdminStatusPill tone="warn">Approaching</AdminStatusPill>;
  }
  return <AdminStatusPill tone="neutral">Below threshold</AdminStatusPill>;
}

export function AdminTaxNexusPage() {
  const [rows, setRows] = useState<NexusRow[]>([]);
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [salesReport, setSalesReport] = useState<SalesByStateReport | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [showAllStates, setShowAllStates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const range = dateRangeBounds(dateRange);
      const rangeQuery = new URLSearchParams();
      if (range.from) rangeQuery.set("from", range.from);
      if (range.to) rangeQuery.set("to", range.to);
      const rangeSuffix = rangeQuery.toString() ? `&${rangeQuery.toString()}` : "";

      const [nexusRes, repRes, salesRes] = await Promise.all([
        fetch("/api/admin/tax/nexus", { cache: "no-store" }),
        fetch("/api/admin/tax/reporting", { cache: "no-store" }),
        fetch(`/api/admin/tax/reporting?view=sales-by-state${rangeSuffix ? `&${rangeSuffix}` : ""}`, {
          cache: "no-store",
        }),
      ]);

      if (!nexusRes.ok) {
        setRows([]);
        setLoadError("Could not load nexus states.");
      } else {
        const j = (await nexusRes.json()) as { states?: NexusRow[] };
        setRows(Array.isArray(j.states) ? j.states : []);
      }

      if (repRes.ok) {
        const rj = (await repRes.json()) as { summary?: TaxSummary };
        setSummary(rj.summary ?? null);
      } else {
        setSummary(null);
        setLoadError((prev) => prev ?? "Could not load tax reporting summary.");
      }

      if (salesRes.ok) {
        setSalesReport((await salesRes.json()) as SalesByStateReport);
      } else {
        setSalesReport(null);
      }
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  const syncReporting = useCallback(async () => {
    setSyncBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tax/reporting", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        summary?: TaxSummary;
        ordersRepaired?: number;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Sync failed.");
        return;
      }
      setSummary(j.summary ?? null);
      await load();
    } finally {
      setSyncBusy(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (stateCode: string, enabled: boolean) => {
    setBusy(stateCode);
    setError(null);
    try {
      const res = await fetch("/api/admin/tax/nexus", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateCode, enabled }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Update failed.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const enabledCount = rows.filter((r) => r.enabled).length;

  const visibleSalesRows = useMemo(() => {
    if (!salesReport) return [];
    if (showAllStates) return salesReport.rows;
    return salesReport.rows.filter((r) => r.totalGmvCents > 0 || r.orderCount > 0 || r.collectionEnabled);
  }, [salesReport, showAllStates]);

  const watchCounts = useMemo(() => {
    if (!salesReport) return { approaching: 0, exceeded: 0 };
    return salesReport.rows.reduce(
      (acc, row) => {
        if (row.collectionEnabled) return acc;
        if (row.nexusWatchLevel === "exceeded") acc.exceeded += 1;
        if (row.nexusWatchLevel === "approaching") acc.approaching += 1;
        return acc;
      },
      { approaching: 0, exceeded: 0 },
    );
  }, [salesReport]);

  const dateRangeLabel =
    dateRange === "30d"
      ? "Last 30 days"
      : dateRange === "90d"
        ? "Last 90 days"
        : dateRange === "ytd"
          ? "Year to date"
          : "All time";

  const salesExportParams = useMemo(() => dateRangeBounds(dateRange), [dateRange]);

  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-4 lg:px-10">
      <h1 className="font-display text-xl font-black tracking-tight">Sales tax nexus</h1>
      <p className="mt-1 max-w-2xl text-xs text-zinc-500">
        Get Vaulted collects buyer-paid sales tax only in enabled states, based on the buyer&apos;s delivery address
        (never the seller&apos;s). Texas is enabled by default. Enable additional states only after registering in Stripe
        Tax. Platform fee and seller payout exclude tax.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={syncBusy || loading}
          onClick={() => void syncReporting()}
          className="rounded-lg border border-gold/35 bg-gold/10 px-3 py-2 text-xs font-semibold text-gold-bright hover:bg-gold/15 disabled:opacity-50"
        >
          {syncBusy ? "Syncing…" : "Sync reporting from orders"}
        </button>
        <p className="text-[11px] text-zinc-500">
          Rebuild totals from paid orders and Stripe payment metadata (fixes live checkout rows that showed $0).
        </p>
      </div>

      {summary ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Tax collected</p>
            <p className="mt-1 text-lg font-black text-emerald-300">
              ${(summary.taxCollectedCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Net tax due</p>
            <p className="mt-1 text-lg font-black text-gold-bright">
              ${(summary.netTaxDueCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Taxable sales</p>
            <p className="mt-1 text-lg font-black text-zinc-100">
              ${(summary.taxableSalesCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Paid orders tracked</p>
            <p className="mt-1 text-lg font-black text-zinc-100">{summary.orderCount.toLocaleString()}</p>
          </div>
        </div>
      ) : !loading ? (
        <p className="mt-4 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-400">
          No reporting summary loaded yet. Use sync if you have paid orders with tax.
        </p>
      ) : null}

      {summary && summary.taxCollectedCents === 0 && summary.orderCount > 0 ? (
        <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
          {summary.orderCount} paid order{summary.orderCount === 1 ? "" : "s"} tracked, but none show collected tax yet.
          Tax only counts when the buyer&apos;s ship-to state is enabled above and checkout actually charged sales tax.
          Try <span className="font-semibold">Sync reporting from orders</span> after live or marketplace test purchases to
          TX (or another enabled state).
        </p>
      ) : null}

      {loadError ? (
        <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">
          {loadError}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{error}</p>
      ) : null}

      <p className="mt-4 text-xs text-zinc-400">
        Active nexus states: <span className="font-semibold text-zinc-200">{enabledCount}</span>
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80">
        <table className="w-full min-w-[480px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Basis</th>
              <th className="px-3 py-2">Collection</th>
              <th className="px-3 py-2">Registered</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.stateCode} className="border-b border-white/[0.05] text-zinc-300">
                  <td className="px-3 py-2">
                    <span className="font-mono font-semibold text-zinc-100">{r.stateCode}</span>
                    <span className="ml-2 text-zinc-500">{r.label}</span>
                  </td>
                  <td className="px-3 py-2 text-[10px] text-zinc-500">{r.collectionBasis ?? "—"}</td>
                  <td className="px-3 py-2">{r.enabled ? <span className="text-emerald-300">Enabled</span> : "Off"}</td>
                  <td className="px-3 py-2 text-[10px] text-zinc-600">
                    {r.registeredAt ? new Date(r.registeredAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={busy === r.stateCode}
                      onClick={() => void toggle(r.stateCode, !r.enabled)}
                      className="rounded border border-white/15 px-2 py-1 text-[10px] font-semibold hover:border-gold/30 disabled:opacity-50"
                    >
                      {busy === r.stateCode ? "…" : r.enabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-200">Sales by state</h2>
            <p className="mt-1 max-w-2xl text-xs text-zinc-500">
              Destination GMV by buyer ship-to state. Use this to monitor economic nexus before registering new states in
              Stripe Tax.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Period
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRangeKey)}
                className={`${adminSelectClassName} ml-2`}
              >
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="ytd">Year to date</option>
                <option value="all">All time</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-[10px] text-zinc-500">
              <input
                type="checkbox"
                checked={showAllStates}
                onChange={(e) => setShowAllStates(e.target.checked)}
                className="rounded border-white/20"
              />
              Show all states
            </label>
            <AdminCsvExportButton
              report="tax-sales-by-state"
              params={salesExportParams}
              label="Export sales by state"
            />
            <AdminCsvExportButton report="tax-summary" label="Export tax summary" />
            <AdminCsvExportButton report="tax-nexus" label="Export nexus states" />
          </div>
        </div>

        {salesReport ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className={`${adminPanelClassName} p-3`}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Destination GMV</p>
                <p className="mt-1 text-lg font-black text-gold-bright">
                  {formatAdminUsd(salesReport.totals.totalGmvCents / 100)}
                </p>
                <p className="mt-1 text-[10px] text-zinc-600">{dateRangeLabel}</p>
              </div>
              <div className={`${adminPanelClassName} p-3`}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Tax collected</p>
                <p className="mt-1 text-lg font-black text-emerald-300">
                  {formatCents(salesReport.totals.taxCollectedCents)}
                </p>
              </div>
              <div className={`${adminPanelClassName} p-3`}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">States with sales</p>
                <p className="mt-1 text-lg font-black text-zinc-100">{salesReport.totals.statesWithSales}</p>
              </div>
              <div className={`${adminPanelClassName} p-3`}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Approaching nexus</p>
                <p className="mt-1 text-lg font-black text-amber-300">{watchCounts.approaching}</p>
              </div>
              <div className={`${adminPanelClassName} p-3`}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Review nexus</p>
                <p className="mt-1 text-lg font-black text-rose-300">{watchCounts.exceeded}</p>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-zinc-600">
              Reference thresholds: {formatCents(salesReport.thresholds.salesThresholdCents)} sales or{" "}
              {salesReport.thresholds.transactionThreshold} transactions. {salesReport.thresholds.note}
            </p>

            <div className={`mt-4 overflow-x-auto ${adminPanelClassName}`}>
              <table className={adminTableClassName}>
                <thead>
                  <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th>State</th>
                    <th>Total GMV</th>
                    <th>Tax collected</th>
                    <th>Orders</th>
                    <th>% of $100k</th>
                    <th>% of 200 orders</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-zinc-500">
                        Loading…
                      </td>
                    </tr>
                  ) : visibleSalesRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-zinc-500">
                        No destination sales in this period yet. Run a test purchase or sync reporting from orders.
                      </td>
                    </tr>
                  ) : (
                    visibleSalesRows.map((row) => (
                      <tr key={row.stateCode} className="border-b border-white/[0.05] text-zinc-300">
                        <td>
                          <span className="font-mono font-semibold text-zinc-100">{row.stateCode}</span>
                          <span className="ml-2 text-zinc-500">{row.label}</span>
                        </td>
                        <td className="font-semibold text-zinc-100">{formatCents(row.totalGmvCents)}</td>
                        <td>{row.taxCollectedCents > 0 ? formatCents(row.taxCollectedCents) : "—"}</td>
                        <td>{row.orderCount.toLocaleString()}</td>
                        <td className="text-zinc-400">
                          {row.collectionEnabled ? "—" : `${row.salesThresholdPercent.toFixed(0)}%`}
                        </td>
                        <td className="text-zinc-400">
                          {row.collectionEnabled ? "—" : `${row.transactionThresholdPercent.toFixed(0)}%`}
                        </td>
                        <td>
                          <NexusWatchBadge row={row} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : !loading ? (
          <p className="mt-4 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-400">
            Sales-by-state report unavailable. Try syncing reporting from orders.
          </p>
        ) : null}
      </section>
    </main>
  );
}
