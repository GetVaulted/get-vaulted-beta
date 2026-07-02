"use client";

import { useCallback, useEffect, useState } from "react";

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

export function AdminTaxNexusPage() {
  const [rows, setRows] = useState<NexusRow[]>([]);
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [monitorRows, setMonitorRows] = useState<
    { stateCode: string; taxableSalesCents: number; orderCount: number; collectionEnabled: boolean }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/tax/nexus", { cache: "no-store" });
      if (!res.ok) {
        setRows([]);
        setLoadError("Could not load nexus states.");
        return;
      }
      const j = (await res.json()) as { states?: NexusRow[] };
      setRows(Array.isArray(j.states) ? j.states : []);
      const rep = await fetch("/api/admin/tax/reporting", { cache: "no-store" });
      if (rep.ok) {
        const rj = (await rep.json()) as { summary?: TaxSummary };
        setSummary(rj.summary ?? null);
      } else {
        setSummary(null);
        setLoadError((prev) => prev ?? "Could not load tax reporting summary.");
      }
      const mon = await fetch("/api/admin/tax/reporting?view=nexus-monitor", { cache: "no-store" });
      if (mon.ok) {
        const mj = (await mon.json()) as { rows?: typeof monitorRows };
        setMonitorRows(Array.isArray(mj.rows) ? mj.rows : []);
      } else {
        setMonitorRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

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

      {monitorRows.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-zinc-200">Destination volume monitor</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Informational only — does not auto-enable collection. Use this to decide when to register new states.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full min-w-[420px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-[10px] uppercase text-zinc-500">
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Taxable GMV</th>
                  <th className="px-3 py-2">Orders</th>
                  <th className="px-3 py-2">Collecting</th>
                </tr>
              </thead>
              <tbody>
                {monitorRows.slice(0, 15).map((m) => (
                  <tr key={m.stateCode} className="border-b border-white/[0.05] text-zinc-300">
                    <td className="px-3 py-2 font-mono">{m.stateCode}</td>
                    <td className="px-3 py-2">${(m.taxableSalesCents / 100).toLocaleString()}</td>
                    <td className="px-3 py-2">{m.orderCount}</td>
                    <td className="px-3 py-2">{m.collectionEnabled ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </main>
  );
}
