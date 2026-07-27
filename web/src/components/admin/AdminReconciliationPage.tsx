"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminButtonPrimaryClassName,
  adminPanelClassName,
  adminSelectClassName,
  adminTableClassName,
  formatAdminUsd,
} from "@/components/admin/AdminCommandShell";
import { AdminMetricStrip, type AdminMetricCardProps } from "@/components/admin/AdminMetricStrip";
import { AdminCsvExportButton } from "@/components/admin/AdminCsvExportButton";
import { AdminOrderLedgerDrawer } from "@/components/admin/AdminOrderLedgerDrawer";

type Tab = "overview" | "orders" | "stripe" | "shipping" | "tax" | "refunds" | "exceptions";

type DrillState = {
  tab: Tab;
  label: string;
  orderId?: string;
  buyer?: string;
  seller?: string;
  reconStatus?: string;
  paymentStatus?: string;
  paymentStatuses?: string;
  payoutStatuses?: string;
  hasLabel?: string;
  unrecoveredLabel?: string;
  hasTax?: string;
  flaggedOnly?: boolean;
  openLedgerOrderId?: string;
};

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "mtd", label: "Month to date" },
  { value: "prev_month", label: "Previous month" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
] as const;

function moneyCents(cents: number | null | undefined) {
  if (cents == null) return "—";
  return formatAdminUsd(cents / 100);
}

function SourceBadge({ source, onClick }: { source?: string; onClick?: () => void }) {
  const pill =
    source === "actual" ? (
      <AdminStatusPill tone="ok">Actual</AdminStatusPill>
    ) : source === "estimated" ? (
      <AdminStatusPill tone="warn">Estimated</AdminStatusPill>
    ) : source === "derived" ? (
      <AdminStatusPill tone="neutral">Derived</AdminStatusPill>
    ) : (
      <AdminStatusPill tone="neutral">—</AdminStatusPill>
    );
  if (!onClick) return pill;
  return (
    <button type="button" className="inline-flex" onClick={onClick} title="Filter by this status">
      {pill}
    </button>
  );
}

function MetricTip({ children }: { children: ReactNode }) {
  return (
    <span className="ml-1 text-[10px] text-zinc-600" title={String(children)}>
      ⓘ
    </span>
  );
}

function legacyRange(range: string): string {
  if (range === "today" || range === "yesterday") return "24h";
  if (range === "7d") return "7d";
  if (range === "90d") return "90d";
  if (range === "all") return "all";
  return "30d";
}

export function AdminReconciliationPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillState | null>(null);

  const [orderId, setOrderId] = useState("");
  const [buyer, setBuyer] = useState("");
  const [seller, setSeller] = useState("");
  const [reconStatus, setReconStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentStatuses, setPaymentStatuses] = useState("");
  const [payoutStatuses, setPayoutStatuses] = useState("");
  const [hasLabel, setHasLabel] = useState("");
  const [unrecoveredLabel, setUnrecoveredLabel] = useState("");
  const [hasTax, setHasTax] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [ledgerOrder, setLedgerOrder] = useState<any | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [retryBusy, setRetryBusy] = useState<string | null>(null);

  const [overview, setOverview] = useState<any | null>(null);
  const [orders, setOrders] = useState<{ rows: any[]; totalCount: number } | null>(null);
  const [stripeReport, setStripeReport] = useState<any | null>(null);
  const [shippingReport, setShippingReport] = useState<any | null>(null);
  const [taxReport, setTaxReport] = useState<any | null>(null);
  const [refundsReport, setRefundsReport] = useState<any | null>(null);
  const [exceptions, setExceptions] = useState<{ exceptions: any[] } | null>(null);

  const qs = useCallback(() => {
    const p = new URLSearchParams({ range });
    if (range === "custom") {
      if (from) p.set("from", from);
      if (to) p.set("to", to);
    }
    return p;
  }, [range, from, to]);

  const applyDrill = useCallback((next: DrillState) => {
    setDrill(next);
    setTab(next.tab);
    setOrderId(next.orderId ?? "");
    setBuyer(next.buyer ?? "");
    setSeller(next.seller ?? "");
    setReconStatus(next.reconStatus ?? "");
    setPaymentStatus(next.paymentStatus ?? "");
    setPaymentStatuses(next.paymentStatuses ?? "");
    setPayoutStatuses(next.payoutStatuses ?? "");
    setHasLabel(next.hasLabel ?? "");
    setUnrecoveredLabel(next.unrecoveredLabel ?? "");
    setHasTax(next.hasTax ?? "");
    setFlaggedOnly(Boolean(next.flaggedOnly));
    if (next.openLedgerOrderId) {
      // ledger opens after orders load
      setLedgerOpen(false);
      setLedgerOrder(null);
    }
  }, []);

  const clearDrill = useCallback(() => {
    setDrill(null);
    setOrderId("");
    setBuyer("");
    setSeller("");
    setReconStatus("");
    setPaymentStatus("");
    setPaymentStatuses("");
    setPayoutStatuses("");
    setHasLabel("");
    setUnrecoveredLabel("");
    setHasTax("");
    setFlaggedOnly(false);
  }, []);

  const openOrderLedger = useCallback(async (id: string, row?: any) => {
    if (row) {
      setLedgerOrder(row);
      setLedgerOpen(true);
      return;
    }
    const p = qs();
    p.set("orderId", id);
    p.set("pageSize", "1");
    const res = await fetch(`/api/admin/reconciliation/orders?${p}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const found = data.rows?.[0];
    if (found) {
      setLedgerOrder(found);
      setLedgerOpen(true);
    }
  }, [qs]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "overview") {
        const res = await fetch(`/api/admin/reconciliation/overview?${qs()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Overview failed (${res.status})`);
        setOverview(await res.json());
      } else if (tab === "orders") {
        const p = qs();
        if (orderId) p.set("orderId", orderId);
        if (buyer) p.set("buyer", buyer);
        if (seller) p.set("seller", seller);
        if (reconStatus) p.set("reconciliationStatus", reconStatus);
        if (paymentStatus) p.set("paymentStatus", paymentStatus);
        if (paymentStatuses) p.set("paymentStatuses", paymentStatuses);
        if (payoutStatuses) p.set("payoutStatuses", payoutStatuses);
        if (hasLabel) p.set("hasLabel", hasLabel);
        if (unrecoveredLabel) p.set("unrecoveredLabel", unrecoveredLabel);
        if (hasTax) p.set("hasTax", hasTax);
        p.set("pageSize", "100");
        const res = await fetch(`/api/admin/reconciliation/orders?${p}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Orders failed (${res.status})`);
        const data = await res.json();
        setOrders(data);
        if (drill?.openLedgerOrderId) {
          const found = data.rows?.find((r: any) => r.orderId === drill.openLedgerOrderId);
          if (found) {
            setLedgerOrder(found);
            setLedgerOpen(true);
            setDrill((d) => (d ? { ...d, openLedgerOrderId: undefined } : d));
          }
        }
      } else if (tab === "stripe") {
        const p = new URLSearchParams({ range: legacyRange(range) });
        if (orderId) p.set("orderId", orderId);
        const res = await fetch(`/api/admin/reconciliation/stripe?${p}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Stripe failed (${res.status})`);
        setStripeReport(await res.json());
      } else if (tab === "shipping") {
        const p = new URLSearchParams({ range: legacyRange(range) });
        if (flaggedOnly) p.set("flaggedOnly", "1");
        const res = await fetch(`/api/admin/reconciliation/shipping?${p}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Shipping failed (${res.status})`);
        setShippingReport(await res.json());
      } else if (tab === "tax") {
        const res = await fetch(`/api/admin/reconciliation/tax?${qs()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Tax failed (${res.status})`);
        setTaxReport(await res.json());
      } else if (tab === "refunds") {
        const res = await fetch(`/api/admin/reconciliation/refunds?${qs()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Refunds failed (${res.status})`);
        setRefundsReport(await res.json());
      } else if (tab === "exceptions") {
        const res = await fetch(`/api/admin/reconciliation/exceptions?${qs()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Exceptions failed (${res.status})`);
        setExceptions(await res.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [
    tab,
    qs,
    orderId,
    buyer,
    seller,
    reconStatus,
    paymentStatus,
    paymentStatuses,
    payoutStatuses,
    hasLabel,
    unrecoveredLabel,
    hasTax,
    flaggedOnly,
    range,
    drill?.openLedgerOrderId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const retryLabelCost = async (id: string) => {
    if (!confirm(`Retry label-cost transfer reversal for order ${id}?`)) return;
    setRetryBusy(id);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/retry-label-cost`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        skipped?: boolean;
        reversedCents?: number;
        reversalId?: string | null;
        error?: string;
        code?: string;
        reason?: string;
      };
      if (!res.ok) {
        const detail = [body.code, body.error].filter(Boolean).join(" — ");
        alert(detail || `Retry failed (HTTP ${res.status}). Check Netlify logs for label_cost_retry_failed.`);
        return;
      }
      if (body.skipped) {
        alert(
          body.reason
            ? `Skipped: ${body.reason}`
            : body.reversalId
              ? `Already clawed back for this Shippo label (${body.reversalId}). Seller was not charged again.`
              : "Skipped — no new seller charge.",
        );
      } else {
        alert(
          `Clawed back ${body.reversedCents ?? 0}¢` +
            (body.reversalId ? ` → ${body.reversalId}` : "") +
            (Array.isArray((body as { chargedAgainstOrderIds?: string[] }).chargedAgainstOrderIds)
              ? ` (order ${(body as { chargedAgainstOrderIds: string[] }).chargedAgainstOrderIds.join(", ")})`
              : "") +
            ". Refresh the ledger if the variance is still showing.",
        );
      }
      void load();
      if (ledgerOpen) void openOrderLedger(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Retry failed — network or server error.");
    } finally {
      setRetryBusy(null);
    }
  };

  const drillToOrders = useCallback(
    (label: string, patch: Partial<DrillState> = {}) => {
      applyDrill({ tab: "orders", label, ...patch });
    },
    [applyDrill],
  );

  const overviewMetrics = useMemo(() => {
    if (!overview) return null;
    const ov = overview;
    const m = (partial: AdminMetricCardProps & { drill: DrillState }): AdminMetricCardProps => ({
      label: partial.label,
      value: partial.value,
      hint: partial.hint,
      tone: partial.tone,
      onClick: () => applyDrill(partial.drill),
    });

    return {
      revenue: [
        m({
          label: "GMV",
          value: ov.revenue.gmvUsd,
          hint: "Click → all paid orders",
          drill: { tab: "orders", label: "GMV / all paid orders" },
        }),
        m({
          label: "Item sales",
          value: ov.revenue.itemSalesUsd,
          hint: "Click → orders",
          drill: { tab: "orders", label: "Item sales" },
        }),
        m({
          label: "Buyer shipping collected",
          value: ov.revenue.buyerShippingCollectedUsd,
          hint: "Pass-through — click → orders",
          drill: { tab: "orders", label: "Buyer shipping collected" },
        }),
        m({
          label: "Platform fees earned",
          value: ov.revenue.platformFeesEarnedUsd,
          tone: "gold",
          hint: "Click → orders (platform fee revenue)",
          drill: { tab: "orders", label: "Platform fees earned" },
        }),
        m({
          label: "Tips retained",
          value: ov.revenue.tipsRetainedUsd,
          hint: ov.formulas.tipsNote,
          drill: { tab: "orders", label: "Tips retained (currently $0)" },
        }),
        m({
          label: "Trade fees",
          value: ov.revenue.tradeFeesUsd,
          drill: { tab: "orders", label: "Trade fees" },
        }),
      ],
      passThrough: [
        m({
          label: "Sales tax collected",
          value: ov.passThrough.salesTaxCollectedUsd,
          hint: "Liability — click → Tax tab",
          drill: { tab: "tax", label: "Sales tax collected" },
        }),
        m({
          label: "Seller-owned proceeds",
          value: ov.passThrough.sellerOwnedProceedsUsd,
          drill: { tab: "orders", label: "Seller-owned proceeds" },
        }),
        m({
          label: "Buyer shipping → sellers",
          value: ov.passThrough.buyerShippingCreditedToSellersUsd,
          drill: { tab: "orders", label: "Buyer shipping credited to sellers" },
        }),
      ],
      stripe: [
        m({
          label: "Processing fees (actual)",
          value: ov.stripeCosts.paymentProcessingFeesActualUsd,
          hint: "Click → Stripe balance",
          drill: { tab: "stripe", label: "Processing fees (actual)" },
        }),
        m({
          label: "Processing fees (estimated)",
          value: ov.stripeCosts.paymentProcessingFeesEstimatedUsd,
          tone: "warn",
          hint: "Click → orders missing BT fee",
          drill: {
            tab: "orders",
            label: "Orders with estimated Stripe processing fee",
            reconStatus: "estimated",
          },
        }),
        m({
          label: "Tax API Calculation fees",
          value: ov.stripeCosts.taxApiCalculationFeesUsd,
          tone: "warn",
          drill: { tab: "tax", label: "Tax API Calculation fees" },
        }),
        m({
          label: "Tax API Transaction fees",
          value: ov.stripeCosts.taxApiTransactionFeesUsd,
          tone: "warn",
          drill: { tab: "tax", label: "Tax API Transaction fees" },
        }),
        m({
          label: "Dispute fees",
          value: ov.stripeCosts.disputeFeesUsd,
          drill: { tab: "refunds", label: "Dispute fees" },
        }),
      ],
      shipping: [
        m({
          label: "Actual Shippo label cost",
          value: ov.shipping.actualLabelCostUsd,
          tone: "warn",
          drill: { tab: "orders", label: "Orders with purchased labels", hasLabel: "1" },
        }),
        m({
          label: "Seller shipping deductions",
          value: ov.shipping.sellerDeductionsUsd,
          tone: "gold",
          drill: { tab: "shipping", label: "Seller shipping deductions" },
        }),
        m({
          label: "Unrecovered label cost",
          value: ov.shipping.unrecoveredLabelCostUsd,
          tone: ov.shipping.unrecoveredLabelCostUsd > 0 ? "warn" : undefined,
          drill: {
            tab: "orders",
            label: "Unrecovered label cost",
            unrecoveredLabel: "1",
            hasLabel: "1",
          },
        }),
        m({
          label: "Shipping variance",
          value: ov.shipping.shippingVarianceUsd,
          hint: "deduction − labelCost",
          drill: { tab: "shipping", label: "Shipping variance", flaggedOnly: true },
        }),
      ],
      refunds: [
        m({
          label: "Buyer refunds",
          value: ov.refundsAndRisk.buyerRefundsUsd,
          tone: "warn",
          drill: { tab: "refunds", label: "Buyer refunds" },
        }),
        m({
          label: "App fee refunds",
          value: ov.refundsAndRisk.applicationFeeRefundsUsd,
          drill: { tab: "stripe", label: "Application fee refunds" },
        }),
        m({
          label: "Transfer reversals",
          value: ov.refundsAndRisk.transferReversalsUsd,
          drill: { tab: "stripe", label: "Transfer reversals" },
        }),
        m({
          label: "Chargeback losses",
          value: ov.refundsAndRisk.chargebackLossesUsd,
          tone: "warn",
          drill: {
            tab: "orders",
            label: "Chargebacks",
            paymentStatus: "chargeback",
            reconStatus: "chargeback",
          },
        }),
        m({
          label: "Frozen seller funds",
          value: ov.refundsAndRisk.frozenSellerFundsUsd,
          drill: {
            tab: "orders",
            label: "Frozen / held seller funds",
            payoutStatuses: "held,blocked,manual_review",
          },
        }),
      ],
      final: [
        m({
          label: "Gross platform revenue",
          value: ov.final.grossPlatformRevenueUsd,
          tone: "gold",
          hint: ov.formulas.grossPlatformRevenue,
          drill: { tab: "orders", label: "Gross platform revenue (fee-bearing orders)" },
        }),
        m({
          label: "Platform operating costs",
          value: ov.final.platformOperatingCostsUsd,
          tone: "warn",
          hint: ov.formulas.platformOperatingCosts,
          drill: { tab: "exceptions", label: "Platform operating cost drivers" },
        }),
        m({
          label: "Net platform revenue",
          value: ov.final.netPlatformRevenueUsd,
          tone: "gold",
          hint: ov.formulas.netPlatformRevenue,
          drill: { tab: "overview", label: "Net platform revenue" },
        }),
        m({
          label: "Current tax liability",
          value: ov.final.currentTaxLiabilityUsd,
          drill: { tab: "tax", label: "Current tax liability", hasTax: "1" },
        }),
        m({
          label: "Unreconciled amount",
          value: ov.final.unreconciledAmountUsd,
          tone: ov.final.unreconciledAmountUsd > 0 ? "warn" : undefined,
          drill: { tab: "exceptions", label: "Unreconciled amount" },
        }),
        m({
          label: "Exception orders",
          value: ov.final.exceptionOrderCount,
          tone: ov.final.exceptionOrderCount > 0 ? "warn" : undefined,
          drill: { tab: "orders", label: "Exception orders", reconStatus: "exception" },
        }),
        m({
          label: "Orders w/ estimated fees",
          value: ov.final.estimatedFeeOrderCount,
          tone: "warn",
          drill: { tab: "orders", label: "Estimated processing fees", reconStatus: "estimated" },
        }),
      ],
    };
  }, [overview, applyDrill]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "Orders" },
    { id: "stripe", label: "Stripe Balance" },
    { id: "shipping", label: "Shipping" },
    { id: "tax", label: "Tax" },
    { id: "refunds", label: "Refunds & Disputes" },
    { id: "exceptions", label: "Exceptions" },
  ];

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; text: string; clear: () => void }[] = [];
    if (drill?.label) chips.push({ key: "drill", text: drill.label, clear: clearDrill });
    if (orderId) chips.push({ key: "orderId", text: `Order ${orderId}`, clear: () => setOrderId("") });
    if (buyer) chips.push({ key: "buyer", text: `Buyer ${buyer}`, clear: () => setBuyer("") });
    if (seller) chips.push({ key: "seller", text: `Seller ${seller}`, clear: () => setSeller("") });
    if (reconStatus)
      chips.push({ key: "recon", text: `Status ${reconStatus}`, clear: () => setReconStatus("") });
    if (paymentStatus)
      chips.push({
        key: "pay",
        text: `Payment ${paymentStatus}`,
        clear: () => setPaymentStatus(""),
      });
    if (paymentStatuses)
      chips.push({
        key: "pays",
        text: `Payments ${paymentStatuses}`,
        clear: () => setPaymentStatuses(""),
      });
    if (payoutStatuses)
      chips.push({
        key: "payout",
        text: `Payout ${payoutStatuses}`,
        clear: () => setPayoutStatuses(""),
      });
    if (hasLabel) chips.push({ key: "label", text: "Has label", clear: () => setHasLabel("") });
    if (unrecoveredLabel)
      chips.push({
        key: "unrec",
        text: "Unrecovered label",
        clear: () => setUnrecoveredLabel(""),
      });
    if (hasTax) chips.push({ key: "tax", text: "Has tax", clear: () => setHasTax("") });
    if (flaggedOnly)
      chips.push({ key: "flag", text: "Flagged only", clear: () => setFlaggedOnly(false) });
    return chips;
  }, [
    drill,
    orderId,
    buyer,
    seller,
    reconStatus,
    paymentStatus,
    paymentStatuses,
    payoutStatuses,
    hasLabel,
    unrecoveredLabel,
    hasTax,
    flaggedOnly,
    clearDrill,
  ]);

  return (
    <AdminCommandShell
      title="Financial Ledger & Reconciliation"
      subtitle="Click any metric to drill into the underlying orders, Stripe rows, shipping labels, tax, refunds, or exceptions. Open a full order ledger in one click."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select value={range} onChange={(e) => setRange(e.target.value)} className={adminSelectClassName}>
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {range === "custom" ? (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={adminSelectClassName} />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={adminSelectClassName} />
            </>
          ) : null}
          <button type="button" className={adminButtonPrimaryClassName} onClick={() => void load()}>
            Refresh
          </button>
          {tab === "overview" || tab === "orders" ? (
            <AdminCsvExportButton
              report="reconciliation"
              params={{
                range:
                  range === "7d" ? "7d" : range === "90d" ? "90d" : range === "all" ? "all" : "30d",
              }}
            />
          ) : null}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-white/[0.08] p-0.5 text-xs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-md px-3 py-1.5 ${tab === t.id ? "bg-white/10 text-zinc-100" : "text-zinc-500"}`}
            onClick={() => {
              setTab(t.id);
              if (t.id === "overview") clearDrill();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeFilterChips.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Active filters</span>
          {activeFilterChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className="inline-flex items-center gap-1 rounded-full border border-gold/20 bg-gold/10 px-2.5 py-1 text-[11px] text-gold-bright hover:bg-gold/20"
              title="Clear filter"
            >
              {c.text} <span className="text-zinc-500">×</span>
            </button>
          ))}
          <button type="button" className="text-[11px] text-zinc-500 hover:text-zinc-300" onClick={clearDrill}>
            Clear all
          </button>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-zinc-500">Loading ledger…</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {!loading && !error && tab === "overview" && overviewMetrics ? (
        <>
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-zinc-500">
            Platform revenue
            <MetricTip>Click any card to open the matching order set</MetricTip>
          </h2>
          <AdminMetricStrip metrics={overviewMetrics.revenue} />

          <h2 className="mt-8 font-display text-sm font-bold uppercase tracking-wide text-zinc-500">
            Pass-through liabilities
          </h2>
          <AdminMetricStrip metrics={overviewMetrics.passThrough} />

          <h2 className="mt-8 font-display text-sm font-bold uppercase tracking-wide text-zinc-500">
            Stripe costs
          </h2>
          <AdminMetricStrip metrics={overviewMetrics.stripe} />

          <h2 className="mt-8 font-display text-sm font-bold uppercase tracking-wide text-zinc-500">
            Shipping
          </h2>
          <AdminMetricStrip metrics={overviewMetrics.shipping} />

          <h2 className="mt-8 font-display text-sm font-bold uppercase tracking-wide text-zinc-500">
            Refunds & risk
          </h2>
          <AdminMetricStrip metrics={overviewMetrics.refunds} />

          <h2 className="mt-8 font-display text-sm font-bold uppercase tracking-wide text-zinc-500">
            Final metrics
          </h2>
          <AdminMetricStrip metrics={overviewMetrics.final} />
        </>
      ) : null}

      {!loading && !error && tab === "orders" ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              className={adminSelectClassName}
              placeholder="Order ID"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            />
            <input
              className={adminSelectClassName}
              placeholder="Buyer"
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
            />
            <input
              className={adminSelectClassName}
              placeholder="Seller"
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
            />
            <select
              className={adminSelectClassName}
              value={reconStatus}
              onChange={(e) => setReconStatus(e.target.value)}
            >
              <option value="">All recon statuses</option>
              <option value="reconciled">Reconciled</option>
              <option value="estimated">Estimated</option>
              <option value="exception">Exception</option>
              <option value="pending_label">Pending label</option>
              <option value="refunded">Refunded</option>
              <option value="chargeback">Chargeback</option>
            </select>
            <button type="button" className={adminButtonPrimaryClassName} onClick={() => void load()}>
              Apply filters
            </button>
          </div>
          <div className={`overflow-x-auto ${adminPanelClassName}`}>
            <table className={adminTableClassName}>
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/[0.08]">
                  <th>Date</th>
                  <th>Order</th>
                  <th>Buyer / Seller</th>
                  <th>Total</th>
                  <th>Platform fee</th>
                  <th>Stripe fee</th>
                  <th>Transfer</th>
                  <th>Label / Deduction</th>
                  <th>Ship var</th>
                  <th>Status</th>
                  <th>Ledger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-300">
                {(orders?.rows ?? []).map((r: any) => (
                  <Fragment key={r.orderId}>
                    <tr
                      className={`cursor-pointer hover:bg-white/[0.03] ${
                        r.reconciliationStatus === "exception" ? "bg-rose-500/[0.04]" : ""
                      }`}
                      onClick={() => void openOrderLedger(r.orderId, r)}
                    >
                      <td className="whitespace-nowrap text-[10px] text-zinc-500">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="max-w-[140px] truncate font-mono text-[11px]">
                        <button
                          type="button"
                          className="text-left text-gold-bright hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openOrderLedger(r.orderId, r);
                          }}
                        >
                          {r.orderId}
                        </button>
                        <div className="truncate text-[10px] text-zinc-500">{r.listingTitle}</div>
                      </td>
                      <td className="text-[11px]">
                        <button
                          type="button"
                          className="hover:text-gold-bright"
                          onClick={(e) => {
                            e.stopPropagation();
                            drillToOrders(`Buyer @${r.buyerUsername}`, { buyer: r.buyerUsername ?? "" });
                          }}
                        >
                          @{r.buyerUsername}
                        </button>
                        <div>
                          <button
                            type="button"
                            className="text-zinc-500 hover:text-gold-bright"
                            onClick={(e) => {
                              e.stopPropagation();
                              drillToOrders(`Seller @${r.sellerUsername}`, {
                                seller: r.sellerUsername ?? "",
                              });
                            }}
                          >
                            @{r.sellerUsername}
                          </button>
                        </div>
                      </td>
                      <td className="font-mono">{moneyCents(r.customerTotalCents)}</td>
                      <td className="font-mono">
                        {moneyCents(r.platformFeeCents?.cents)}{" "}
                        <SourceBadge source={r.platformFeeCents?.source} />
                      </td>
                      <td className="font-mono">
                        {moneyCents(r.stripeProcessingFeeCents?.cents)}{" "}
                        <SourceBadge
                          source={r.stripeProcessingFeeCents?.source}
                          onClick={() => {
                            if (r.stripeProcessingFeeCents?.source === "estimated") {
                              drillToOrders("Estimated processing fees", { reconStatus: "estimated" });
                            }
                          }}
                        />
                      </td>
                      <td className="font-mono">{moneyCents(r.sellerTransferCents?.cents)}</td>
                      <td className="font-mono text-[11px]">
                        <button
                          type="button"
                          className="hover:text-gold-bright"
                          onClick={(e) => {
                            e.stopPropagation();
                            applyDrill({
                              tab: "shipping",
                              label: `Shipping for ${r.orderId}`,
                              orderId: r.orderId,
                            });
                          }}
                        >
                          {moneyCents(r.actualLabelCostCents?.cents)} /{" "}
                          {moneyCents(r.sellerLabelDeductionCents)}
                        </button>
                      </td>
                      <td
                        className={`font-mono ${
                          r.platformShippingVarianceCents !== 0 ? "text-amber-300" : ""
                        }`}
                      >
                        {moneyCents(r.platformShippingVarianceCents)}
                      </td>
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          drillToOrders(`Status ${r.reconciliationStatus}`, {
                            reconStatus: r.reconciliationStatus,
                          });
                        }}
                      >
                        {r.everythingReconciled ? (
                          <AdminStatusPill tone="ok">Reconciled</AdminStatusPill>
                        ) : (
                          <AdminStatusPill
                            tone={r.reconciliationStatus === "exception" ? "bad" : "warn"}
                          >
                            {r.reconciliationStatus}
                          </AdminStatusPill>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={adminButtonPrimaryClassName}
                          onClick={(e) => {
                            e.stopPropagation();
                            void openOrderLedger(r.orderId, r);
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  </Fragment>
                ))}
                {(orders?.rows?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-6 text-center text-zinc-600">
                      No financially relevant orders for this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-zinc-600">
            {orders?.rows?.length ?? 0} of {orders?.totalCount ?? 0} orders · click a row to open the
            full ledger
          </p>
        </>
      ) : null}

      {!loading && !error && tab === "stripe" && stripeReport ? (
        <>
          <AdminMetricStrip
            metrics={[
              {
                label: "Opening (est.)",
                value: stripeReport.openingBalanceUsd ?? 0,
                onClick: () => applyDrill({ tab: "stripe", label: "Opening balance" }),
              },
              {
                label: "Closing available+pending",
                value: stripeReport.closingBalanceUsd ?? 0,
                tone: "gold",
                onClick: () => applyDrill({ tab: "stripe", label: "Closing balance" }),
              },
              {
                label: "App fees collected",
                value: stripeReport.applicationFeesCollectedUsd,
                tone: "gold",
                onClick: () => applyDrill({ tab: "stripe", label: "App fees collected" }),
              },
              {
                label: "Card fees (actual)",
                value: stripeReport.processingFeesActualUsd,
                onClick: () => applyDrill({ tab: "stripe", label: "Card fees actual" }),
              },
              {
                label: "Tax API Calculation",
                value: stripeReport.taxApiCalculationCostUsd,
                tone: "warn",
                onClick: () => applyDrill({ tab: "tax", label: "Tax API Calculation" }),
              },
              {
                label: "Tax API Transaction",
                value: stripeReport.taxApiTransactionCostUsd,
                tone: "warn",
                onClick: () => applyDrill({ tab: "tax", label: "Tax API Transaction" }),
              },
              {
                label: "Variance rows",
                value: stripeReport.varianceRowCount,
                tone: stripeReport.varianceRowCount > 0 ? "warn" : undefined,
                onClick: () => applyDrill({ tab: "exceptions", label: "Stripe variance rows" }),
              },
            ]}
          />
          <div className={`mt-4 overflow-x-auto ${adminPanelClassName}`}>
            <table className={adminTableClassName}>
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/[0.08]">
                  <th>Order / type</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Fee</th>
                  <th>Net</th>
                  <th>Variance</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-300">
                {(stripeReport.rows as any[]).slice(0, 200).map((row, idx) => (
                  <tr
                    key={`${row.balanceTransactionId ?? row.orderId ?? "r"}-${idx}`}
                    className={row.orderId ? "cursor-pointer hover:bg-white/[0.03]" : undefined}
                    onClick={() => {
                      if (row.orderId) void openOrderLedger(row.orderId);
                    }}
                  >
                    <td className="max-w-[180px] truncate font-mono text-[11px]">
                      {row.orderId ? (
                        <button type="button" className="text-gold-bright hover:underline">
                          {row.orderId}
                        </button>
                      ) : (
                        row.category
                      )}
                      {row.description ? (
                        <div className="truncate text-[10px] text-zinc-500">{row.description}</div>
                      ) : null}
                    </td>
                    <td>{row.category}</td>
                    <td className="font-mono">{formatAdminUsd(row.stripeAmountUsd)}</td>
                    <td className="font-mono">{formatAdminUsd(row.stripeFeeUsd)}</td>
                    <td className="font-mono">{formatAdminUsd(row.stripeNetUsd)}</td>
                    <td
                      className={`font-mono ${Math.abs(row.varianceUsd) >= 0.01 ? "text-amber-300" : ""}`}
                    >
                      {formatAdminUsd(row.varianceUsd)}
                    </td>
                    <td>
                      {row.unreconciled ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            applyDrill({ tab: "exceptions", label: "Unreconciled Stripe activity" });
                          }}
                        >
                          <AdminStatusPill tone="warn">Flag</AdminStatusPill>
                        </button>
                      ) : (
                        <AdminStatusPill tone="ok">ok</AdminStatusPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {!loading && !error && tab === "shipping" && shippingReport ? (
        <>
          <div className="mb-4 flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={flaggedOnly}
                onChange={(e) => setFlaggedOnly(e.target.checked)}
              />
              Flagged only
            </label>
          </div>
          <AdminMetricStrip
            metrics={[
              {
                label: "Buyer shipping collected",
                value: shippingReport.buyerShippingCollectedUsd,
                onClick: () => drillToOrders("Buyer shipping collected"),
              },
              {
                label: "Actual label cost",
                value: shippingReport.actualLabelCostUsd,
                tone: "warn",
                onClick: () => drillToOrders("Purchased labels", { hasLabel: "1" }),
              },
              {
                label: "Seller deductions",
                value: shippingReport.sellerDeductionUsd,
                tone: "gold",
                onClick: () => applyDrill({ tab: "shipping", label: "Seller deductions" }),
              },
              {
                label: "Unrecovered",
                value: shippingReport.unrecoveredLabelCostUsd,
                tone: shippingReport.unrecoveredLabelCostUsd > 0 ? "warn" : undefined,
                onClick: () =>
                  drillToOrders("Unrecovered labels", { unrecoveredLabel: "1", hasLabel: "1" }),
              },
              {
                label: "Flagged",
                value: shippingReport.flaggedOrderCount,
                tone: shippingReport.flaggedOrderCount > 0 ? "warn" : undefined,
                onClick: () =>
                  applyDrill({ tab: "shipping", label: "Flagged shipping", flaggedOnly: true }),
              },
            ]}
          />
          <div className={`mt-4 overflow-x-auto ${adminPanelClassName}`}>
            <table className={adminTableClassName}>
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/[0.08]">
                  <th>Order</th>
                  <th>Buyer ship</th>
                  <th>Label cost</th>
                  <th>Deduction</th>
                  <th>Status</th>
                  <th>Variance</th>
                  <th>Payout</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-300">
                {(shippingReport.rows as any[]).map((row) => (
                  <tr
                    key={row.orderId}
                    className={`cursor-pointer hover:bg-white/[0.03] ${
                      row.flagged ? "bg-rose-500/[0.04]" : ""
                    }`}
                    onClick={() => void openOrderLedger(row.orderId)}
                  >
                    <td className="font-mono text-[11px] text-gold-bright">{row.orderId}</td>
                    <td className="font-mono">{moneyCents(row.buyerShippingCents)}</td>
                    <td className="font-mono">{moneyCents(row.actualLabelCostCents)}</td>
                    <td className="font-mono">{moneyCents(row.sellerDeductionCents)}</td>
                    <td
                      onClick={(e) => {
                        e.stopPropagation();
                        applyDrill({
                          tab: "shipping",
                          label: `Status ${row.deductionStatus}`,
                          flaggedOnly: row.flagged,
                        });
                      }}
                    >
                      <AdminStatusPill tone={row.flagged ? "bad" : "ok"}>
                        {row.deductionStatus}
                      </AdminStatusPill>
                    </td>
                    <td
                      className={`font-mono ${
                        row.netShippingVarianceCents !== 0 ? "text-amber-300" : ""
                      }`}
                    >
                      {moneyCents(row.netShippingVarianceCents)}
                    </td>
                    <td className="capitalize">{row.payoutStatus}</td>
                    <td>
                      <button
                        type="button"
                        className={adminButtonPrimaryClassName}
                        onClick={(e) => {
                          e.stopPropagation();
                          void openOrderLedger(row.orderId);
                        }}
                      >
                        Ledger
                      </button>
                      {row.paidByPlatform &&
                      row.actualLabelCostCents != null &&
                      row.sellerDeductionCents < row.actualLabelCostCents ? (
                        <button
                          type="button"
                          disabled={retryBusy === row.orderId}
                          className={`${adminButtonPrimaryClassName} ml-1`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void retryLabelCost(row.orderId);
                          }}
                        >
                          Retry
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {!loading && !error && tab === "tax" && taxReport ? (
        <>
          <AdminMetricStrip
            metrics={[
              {
                label: "Sales tax collected",
                value: taxReport.salesTaxCollectedUsd,
                onClick: () => drillToOrders("Taxable orders", { hasTax: "1" }),
              },
              {
                label: "Tax refunded",
                value: taxReport.taxRefundedUsd,
                onClick: () => applyDrill({ tab: "refunds", label: "Tax refunded" }),
              },
              {
                label: "Current tax liability",
                value: taxReport.currentTaxLiabilityUsd,
                tone: "gold",
                onClick: () => drillToOrders("Tax liability orders", { hasTax: "1" }),
              },
              {
                label: "Tax API Calculation fees",
                value: taxReport.taxApiCalculationFeesUsd,
                tone: "warn",
                onClick: () => applyDrill({ tab: "stripe", label: "Tax API Calculation fees" }),
              },
              {
                label: "Tax API Transaction fees",
                value: taxReport.taxApiTransactionFeesUsd,
                tone: "warn",
                onClick: () => applyDrill({ tab: "stripe", label: "Tax API Transaction fees" }),
              },
            ]}
          />
          <p className="mt-2 text-xs text-zinc-500">{taxReport.note}</p>
          <div className={`mt-4 overflow-x-auto ${adminPanelClassName}`}>
            <table className={adminTableClassName}>
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/[0.08]">
                  <th>Order</th>
                  <th>Tax</th>
                  <th>Refunded</th>
                  <th>Jurisdiction</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-300">
                {(taxReport.rows as any[]).map((row) => (
                  <tr
                    key={row.orderId}
                    className="cursor-pointer hover:bg-white/[0.03]"
                    onClick={() => void openOrderLedger(row.orderId)}
                  >
                    <td className="font-mono text-[11px] text-gold-bright">{row.orderId}</td>
                    <td className="font-mono">{moneyCents(row.taxAmountCents)}</td>
                    <td className="font-mono">{moneyCents(row.taxRefundedCents)}</td>
                    <td>{row.jurisdiction ?? "—"}</td>
                    <td className="text-[10px] text-amber-300">
                      {(row.flags ?? []).join(", ") || "ok"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {!loading && !error && tab === "refunds" && refundsReport ? (
        <>
          <AdminMetricStrip
            metrics={[
              {
                label: "Refund / chargeback rows",
                value: refundsReport.rows?.length ?? 0,
                onClick: () =>
                  drillToOrders("Refunds & chargebacks", {
                    paymentStatuses: "refunded,chargeback",
                  }),
              },
            ]}
          />
          <div className={`mt-4 overflow-x-auto ${adminPanelClassName}`}>
            <table className={adminTableClassName}>
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/[0.08]">
                  <th>Order</th>
                  <th>Type</th>
                  <th>Buyer / Seller</th>
                  <th>Refund</th>
                  <th>Unrecovered</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-300">
                {(refundsReport.rows as any[]).map((row) => (
                  <tr
                    key={row.orderId}
                    className="cursor-pointer hover:bg-white/[0.03]"
                    onClick={() => void openOrderLedger(row.orderId)}
                  >
                    <td className="font-mono text-[11px] text-gold-bright">{row.orderId}</td>
                    <td className="capitalize">{row.type}</td>
                    <td className="text-[11px]">
                      @{row.buyerUsername}
                      <div className="text-zinc-500">@{row.sellerUsername}</div>
                    </td>
                    <td className="font-mono">{formatAdminUsd(row.buyerRefundUsd)}</td>
                    <td className="font-mono text-amber-300">
                      {formatAdminUsd(row.platformUnrecoveredUsd)}
                    </td>
                    <td className="text-[10px] text-amber-300">
                      {(row.flags ?? []).join(", ") || "ok"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Also see{" "}
            <Link href="/admin/refund-requests" className="text-gold-bright hover:underline">
              Refund requests queue
            </Link>
            .
          </p>
        </>
      ) : null}

      {!loading && !error && tab === "exceptions" && exceptions ? (
        <>
          <AdminMetricStrip
            metrics={[
              {
                label: "Open exceptions",
                value: exceptions.exceptions.length,
                tone: exceptions.exceptions.length > 0 ? "warn" : undefined,
                onClick: () =>
                  drillToOrders("Exception orders", { reconStatus: "exception" }),
              },
              {
                label: "Critical",
                value: exceptions.exceptions.filter((e: any) => e.severity === "critical").length,
                tone: "warn",
                onClick: () => applyDrill({ tab: "exceptions", label: "Critical exceptions" }),
              },
            ]}
          />
          <div className={`mt-4 overflow-x-auto ${adminPanelClassName}`}>
            <table className={adminTableClassName}>
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/[0.08]">
                  <th>Severity</th>
                  <th>Type</th>
                  <th>Order</th>
                  <th>At risk</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-300">
                {exceptions.exceptions.map((ex: any) => (
                  <tr
                    key={ex.id}
                    className={`cursor-pointer hover:bg-white/[0.03] ${
                      ex.severity === "critical" ? "bg-rose-500/[0.05]" : ""
                    }`}
                    onClick={() => {
                      if (ex.orderId) void openOrderLedger(ex.orderId);
                    }}
                  >
                    <td>
                      <AdminStatusPill tone={ex.severity === "critical" ? "bad" : "warn"}>
                        {ex.severity}
                      </AdminStatusPill>
                    </td>
                    <td className="font-mono text-[10px]">{ex.type}</td>
                    <td className="font-mono text-[11px] text-gold-bright">
                      {ex.orderId ?? "—"}
                    </td>
                    <td className="font-mono">{formatAdminUsd(ex.amountAtRiskUsd)}</td>
                    <td className="max-w-[280px] text-[11px] text-zinc-400">{ex.reason}</td>
                    <td className="max-w-[200px] text-[11px]">
                      {ex.recommendedAction}
                      {ex.orderId ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <button
                            type="button"
                            className={adminButtonPrimaryClassName}
                            onClick={(e) => {
                              e.stopPropagation();
                              void openOrderLedger(ex.orderId);
                            }}
                          >
                            Ledger
                          </button>
                          {ex.type === "label_purchased_seller_not_charged" ? (
                            <button
                              type="button"
                              className={adminButtonPrimaryClassName}
                              disabled={retryBusy === ex.orderId}
                              onClick={(e) => {
                                e.stopPropagation();
                                void retryLabelCost(ex.orderId);
                              }}
                            >
                              Retry reversal
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <AdminOrderLedgerDrawer
        open={ledgerOpen}
        order={ledgerOrder}
        onClose={() => {
          setLedgerOpen(false);
          setLedgerOrder(null);
        }}
        onRetryLabelCost={(id) => void retryLabelCost(id)}
        retryBusy={retryBusy === ledgerOrder?.orderId}
      />
    </AdminCommandShell>
  );
}
