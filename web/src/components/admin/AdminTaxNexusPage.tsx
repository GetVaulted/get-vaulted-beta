"use client";

import { useCallback, useEffect, useState } from "react";

type NexusRow = {
  stateCode: string;
  label: string;
  enabled: boolean;
  registeredAt: string | null;
  notes: string | null;
};

export function AdminTaxNexusPage() {
  const [rows, setRows] = useState<NexusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tax/nexus", { cache: "no-store" });
      if (!res.ok) {
        setRows([]);
        return;
      }
      const j = (await res.json()) as { states?: NexusRow[] };
      setRows(Array.isArray(j.states) ? j.states : []);
    } finally {
      setLoading(false);
    }
  }, []);

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
        Stripe Tax collects buyer-paid sales tax only in enabled states. Texas is enabled by default. Register each state
        in your Stripe Tax dashboard before enabling here. Platform fee and seller payout exclude tax.
      </p>

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
              <th className="px-3 py-2">Collection</th>
              <th className="px-3 py-2">Registered</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-zinc-500">
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
    </main>
  );
}
