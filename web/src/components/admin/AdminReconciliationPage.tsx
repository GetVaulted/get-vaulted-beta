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
import { AdminCsvExportButton } from "@/components/admin/AdminCsvExportButton";

type PayoutStatusBreakdownRow = { status: string; orderCount: number; sellerNetUsd: number };

type Report = {
  rangeKey: "24h" | "7d" | "30d" | "90d" | "all";
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

type StripeRow = {
  orderId: string | null;
  sellerId: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  balanceTransactionId: string | null;
  transactionType: string;
  category: string;
  description: string | null;
  internalGrossUsd: number | null;
  internalPlatformFeeUsd: number | null;
  expectedPlatformNetUsd: number | null;
  stripeAmountUsd: number;
  stripeFeeUsd: number;
  stripeNetUsd: number;
  stripeProcessingFeeCents: number | null;
  stripeApplicationFeeCents: number | null;
  stripeTransferId: string | null;
  taxApiCostUsd: number;
  varianceUsd: number;
  unreconciled: boolean;
};

type StripeReport = {
  rangeKey: Report["rangeKey"];
  rangeStart: string | null;
  generatedAt: string;
  stripeConfigured: boolean;
  openingBalanceUsd: number | null;
  closingBalanceUsd: number | null;
  aggregateCreditsUsd: number;
  aggregateDebitsUsd: number;
  taxApiCalculationCostUsd: number;
  taxApiTransactionCostUsd: number;
  taxApiFeeOnBillingUsd: number;
  applicationFeesCollectedUsd: number;
  applicationFeeRefundsUsd: number;
  transferRefundsUsd: number;
  processingFeesActualUsd: number;
  orderRowCount: number;
  varianceRowCount: number;
  rows: StripeRow[];
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

type Tab = "ledger" | "stripe";

export function AdminReconciliationPage() {
  const [tab, setTab] = useState<Tab>("ledger");
  const [range, setRange] = useState<Report["rangeKey"]>("30d");
  const [report, setReport] = useState<Report | null>(null);
  const [stripeReport, setStripeReport] = useState<StripeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderIdFilter, setOrderIdFilter] = useState("");
  const [piFilter, setPiFilter] = useState("");

  const loadLedger = useCallback(async () => {
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

  const loadStripe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range });
      if (orderIdFilter.trim()) params.set("orderId", orderIdFilter.trim());
      if (piFilter.trim()) params.set("paymentIntentId", piFilter.trim());
      const res = await fetch(`/api/admin/reconciliation/stripe?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load Stripe reconciliation (${res.status})`);
      setStripeReport((await res.json()) as StripeReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Stripe reconciliation");
    } finally {
      setLoading(false);
    }
  }, [range, orderIdFilter, piFilter]);

  useEffect(() => {
    if (tab === "ledger") void loadLedger();
    else void loadStripe();
  }, [tab, loadLedger, loadStripe]);

  return (
    <AdminCommandShell
      title="Financial Reconciliation"
      subtitle="DB order ledger vs Stripe Balance Transactions. Tax API usage bills are platform expenses — not sales tax collected."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/[0.08] p-0.5 text-xs">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${tab === "ledger" ? "bg-white/10 text-zinc-100" : "text-zinc-500"}`}
              onClick={() => setTab("ledger")}
            >
              Order ledger
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${tab === "stripe" ? "bg-white/10 text-zinc-100" : "text-zinc-500"}`}
              onClick={() => setTab("stripe")}
            >
              Stripe balance
            </button>
          </div>
          <select value={range} onChange={(e) => setRange(e.target.value as Report["rangeKey"])} className={adminSelectClassName}>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          {tab === "ledger" ? <AdminCsvExportButton report="reconciliation" params={{ range }} /> : null}
        </div>
      }
    >
      {loading && !(tab === "ledger" ? report : stripeReport) ? (
        <p className="text-sm text-zinc-500">Loading reconciliation data…</p>
      ) : error ? (
        <p className="text-sm text-rose-400">{error}</p>
      ) : tab === "ledger" && report ? (
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
      ) : tab === "stripe" && stripeReport ? (
        <>
          {!stripeReport.stripeConfigured ? (
            <p className="text-sm text-amber-400">Stripe is not configured — cannot load Balance Transactions.</p>
          ) : null}
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              className={adminSelectClassName}
              placeholder="Filter order ID"
              value={orderIdFilter}
              onChange={(e) => setOrderIdFilter(e.target.value)}
            />
            <input
              className={adminSelectClassName}
              placeholder="Filter payment intent"
              value={piFilter}
              onChange={(e) => setPiFilter(e.target.value)}
            />
            <button
              type="button"
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200"
              onClick={() => void loadStripe()}
            >
              Apply filters
            </button>
          </div>
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-zinc-500">Stripe balance (source of truth)</h2>
          <AdminMetricStrip
            metrics={[
              { label: "Opening (est.)", value: stripeReport.openingBalanceUsd ?? 0, hint: "Closing − period net from listed BTs" },
              { label: "Closing available+pending", value: stripeReport.closingBalanceUsd ?? 0, tone: "gold" },
              { label: "Credits", value: stripeReport.aggregateCreditsUsd },
              { label: "Debits", value: stripeReport.aggregateDebitsUsd, tone: "warn" },
              { label: "Tax API calculations", value: stripeReport.taxApiCalculationCostUsd, tone: "warn", hint: "Stripe Tax Calculation API usage bills" },
              { label: "Tax API transactions", value: stripeReport.taxApiTransactionCostUsd, tone: "warn", hint: "createFromCalculation usage bills" },
              { label: "Tax API billing fees", value: stripeReport.taxApiFeeOnBillingUsd, tone: "warn" },
              { label: "App fees collected", value: stripeReport.applicationFeesCollectedUsd, tone: "gold" },
              { label: "App fee refunds", value: stripeReport.applicationFeeRefundsUsd, tone: "warn" },
              { label: "Transfer refunds", value: stripeReport.transferRefundsUsd },
              { label: "Card fees (actual)", value: stripeReport.processingFeesActualUsd, hint: "From charge balance_transaction.fee" },
              { label: "Variance rows", value: stripeReport.varianceRowCount, tone: stripeReport.varianceRowCount > 0 ? "warn" : undefined },
            ]}
          />

          <h2 className="mt-8 font-display text-sm font-bold uppercase tracking-wide text-zinc-500">Order / balance rows</h2>
          <div className={`mt-3 overflow-x-auto ${adminPanelClassName}`}>
            <table className={adminTableClassName}>
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/[0.08]">
                  <th>Order / type</th>
                  <th>PI / Charge / BT</th>
                  <th>Expected net</th>
                  <th>Stripe fee</th>
                  <th>App fee</th>
                  <th>Variance</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-300">
                {stripeReport.rows.map((row, idx) => (
                  <tr key={`${row.balanceTransactionId ?? row.orderId ?? "row"}-${idx}`}>
                    <td className="max-w-[180px] truncate font-mono text-[11px]">
                      {row.orderId ?? row.category}
                      {row.description ? (
                        <div className="truncate text-[10px] text-zinc-500">{row.description}</div>
                      ) : null}
                    </td>
                    <td className="max-w-[220px] truncate font-mono text-[10px] text-zinc-400">
                      {[row.paymentIntentId, row.chargeId, row.balanceTransactionId].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="font-mono">
                      {row.expectedPlatformNetUsd != null ? formatAdminUsd(row.expectedPlatformNetUsd) : "—"}
                    </td>
                    <td className="font-mono">{formatAdminUsd(row.stripeFeeUsd)}</td>
                    <td className="font-mono">
                      {row.stripeApplicationFeeCents != null
                        ? formatAdminUsd(row.stripeApplicationFeeCents / 100)
                        : "—"}
                    </td>
                    <td className={`font-mono ${Math.abs(row.varianceUsd) >= 0.01 ? "text-amber-300" : ""}`}>
                      {formatAdminUsd(row.varianceUsd)}
                    </td>
                    <td>{row.unreconciled ? "⚠" : "ok"}</td>
                  </tr>
                ))}
                {stripeReport.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-zinc-600">
                      No rows in this range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 font-display text-sm font-bold uppercase tracking-wide text-zinc-500">Assumptions</h2>
          <ul className="mt-3 space-y-1.5 text-xs text-zinc-500">
            {stripeReport.assumptions.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
          <p className="mt-6 text-[11px] text-zinc-600">
            Generated {new Date(stripeReport.generatedAt).toLocaleString()} · {stripeReport.orderRowCount} orders · showing{" "}
            {stripeReport.rows.length} rows.
          </p>
        </>
      ) : null}
    </AdminCommandShell>
  );
}
