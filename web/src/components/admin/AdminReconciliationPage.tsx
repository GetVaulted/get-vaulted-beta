"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminCommandShell,
  adminPanelClassName,
  adminSelectClassName,
  adminTableClassName,
  formatAdminUsd,
} from "@/components/admin/AdminCommandShell";
import { AdminMetricStrip } from "@/components/admin/AdminMetricStrip";

type PayoutStatusBreakdownRow = { status: string; orderCount: number; sellerNetUsd: number };

type Report = {
  rangeKey: "7d" | "30d" | "90d" | "all";
  rangeStart: string | null;
  generatedAt: string;
  paidOrderCount: number;
  refundedOrderCount: number;
  grossSalesUsd: number;
  gmvUsd: number;
  platformRevenueUsd: number;
  processingFeesUsd: number;
  salesTaxCollectedUsd: number;
  shippingCollectedUsd: number;
  shippingLabelCostUsd: number;
  sellerNetUsd: number;
  payoutStatusBreakdown: PayoutStatusBreakdownRow[];
  refundAdjustments: {
    refundedOrderCount: number;
    chargebackOrderCount: number;
    refundedGrossUsd: number;
    taxReversedUsd: number;
    platformFeeOnRefundedOrdersUsd: number;
  };
  companyNetRevenueUsd: number;
  assumptions: string[];
};

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  held: "Held",
  delivery_confirmed: "Delivery confirmed",
  fast_payout_ready: "Fast payout ready",
  label_payout_ready: "Label payout ready",
  instant_payout_ready: "Instant payout ready",
  paid_out: "Paid out",
  blocked: "Blocked",
  manual_review: "Manual review",
};

export function AdminReconciliationPage() {
  const [range, setRange] = useState<Report["rangeKey"]>("30d");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reconciliation?range=${range}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      setReport((await res.json()) as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reconciliation report");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminCommandShell
      title="Financial Reconciliation"
      subtitle="Buyer charge → platform fee → processing fee → tax → shipping → seller net → payout → refund adjustments, reconciled end-to-end for the selected period."
      actions={
        <select value={range} onChange={(e) => setRange(e.target.value as Report["rangeKey"])} className={adminSelectClassName}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      }
    >
      {loading && !report ? (
        <p className="text-sm text-zinc-500">Loading reconciliation data…</p>
      ) : error ? (
        <p className="text-sm text-rose-400">{error}</p>
      ) : report ? (
        <>
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-zinc-500">Sales &amp; revenue</h2>
          <AdminMetricStrip
            metrics={[
              { label: "Gross sales USD", value: report.grossSalesUsd, tone: "gold", hint: "Buyer charge total: item + shipping + tax" },
              { label: "GMV USD", value: report.gmvUsd, hint: "Item price only, excludes tax & shipping" },
              { label: "Platform revenue USD", value: report.platformRevenueUsd, tone: "gold", hint: "Tiered/flat application fee actually assessed" },
              { label: "Processing fees (est.)", value: report.processingFeesUsd, hint: "Seller-paid Stripe cost — reference only" },
              { label: "Sales tax collected", value: report.salesTaxCollectedUsd, hint: "Pass-through to tax authority, not revenue" },
              { label: "Shipping collected", value: report.shippingCollectedUsd, hint: "Pass-through to seller, not revenue" },
              { label: "Shipping label cost", value: report.shippingLabelCostUsd, tone: "warn", hint: "Actual carrier cost incurred by platform" },
              { label: "Seller net USD", value: report.sellerNetUsd, hint: "Item price − platform fee − payout reserve" },
              { label: "Company net revenue", value: report.companyNetRevenueUsd, tone: "gold", hint: "Platform revenue − shipping label cost" },
              { label: "Paid orders", value: report.paidOrderCount },
            ]}
          />

          <h2 className="mt-8 font-display text-sm font-bold uppercase tracking-wide text-zinc-500">Refund &amp; dispute adjustments</h2>
          <AdminMetricStrip
            metrics={[
              { label: "Refunded orders", value: report.refundAdjustments.refundedOrderCount, tone: "warn" },
              { label: "Chargebacks (lost disputes)", value: report.refundAdjustments.chargebackOrderCount, tone: "warn" },
              { label: "Refunded gross USD", value: report.refundAdjustments.refundedGrossUsd, tone: "warn" },
              { label: "Tax reversed USD", value: report.refundAdjustments.taxReversedUsd },
              {
                label: "Platform fee retained on refunds",
                value: report.refundAdjustments.platformFeeOnRefundedOrdersUsd,
                tone: "warn",
                hint: "Not reversed on refund today — flagged assumption, see notes below",
              },
            ]}
          />

          <h2 className="mt-8 font-display text-sm font-bold uppercase tracking-wide text-zinc-500">Seller payout status</h2>
          <div className={`mt-3 overflow-x-auto ${adminPanelClassName}`}>
            <table className={adminTableClassName}>
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/[0.08]">
                  <th>Status</th>
                  <th>Orders</th>
                  <th>Seller net USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-300">
                {report.payoutStatusBreakdown.map((row) => (
                  <tr key={row.status}>
                    <td>{PAYOUT_STATUS_LABELS[row.status] ?? row.status}</td>
                    <td className="font-mono">{row.orderCount.toLocaleString()}</td>
                    <td className="font-mono">{formatAdminUsd(row.sellerNetUsd)}</td>
                  </tr>
                ))}
                {report.payoutStatusBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-zinc-600">
                      No paid orders in this range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 font-display text-sm font-bold uppercase tracking-wide text-zinc-500">Assumptions &amp; notes</h2>
          <ul className="mt-3 space-y-1.5 text-xs text-zinc-500">
            {report.assumptions.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
          <p className="mt-6 text-[11px] text-zinc-600">
            Generated {new Date(report.generatedAt).toLocaleString()} · Range start{" "}
            {report.rangeStart ? new Date(report.rangeStart).toLocaleDateString() : "all time"} · Orders grouped by creation date.
          </p>
        </>
      ) : null}
    </AdminCommandShell>
  );
}
