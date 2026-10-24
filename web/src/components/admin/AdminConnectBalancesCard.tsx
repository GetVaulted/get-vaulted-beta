"use client";

import { useState } from "react";
import { adminPanelClassName } from "@/components/admin/AdminCommandShell";

type Row = {
  username: string | null;
  availableUsd: number;
  pendingUsd: number;
  payableUsd: number | null;
  creditUsd: number;
  state: string | null;
  gapUsd: number | null;
};

type Payload = { checkedSellers: number; failedBalanceLookups: number; rows: Row[] };

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Read-only: live Stripe "available" balance per seller next to what their Initiate Payout button can send.
 * A gap means money is in Stripe that the seller cannot pay out yet (add a payout credit to release it).
 */
export function AdminConnectBalancesCard() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernames, setUsernames] = useState("");

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const qs = usernames.trim() ? `?usernames=${encodeURIComponent(usernames.trim())}` : "";
      const res = await fetch(`/api/admin/payouts/connect-balances${qs}`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as Payload & { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Could not check balances.");
        return;
      }
      setData(j);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${adminPanelClassName} mb-6 p-4`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Money in sellers&apos; Stripe balances</h2>
          <p className="mt-1 max-w-2xl text-xs text-zinc-500">
            Live Stripe available balance next to what each seller can actually pay out. &quot;Stuck&quot; is money in
            Stripe their button can&apos;t send yet. Read-only; checks recent sellers, or only the usernames you list.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Only these (optional, comma separated)
            </span>
            <input
              id="connect-balances-usernames"
              value={usernames}
              onChange={(e) => setUsernames(e.target.value)}
              className="w-64 rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
              placeholder="haggybreaks, 3gsports"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run()}
            className="rounded-lg bg-gold/15 px-4 py-2 text-xs font-bold text-gold-bright hover:bg-gold/25 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Check balances"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-rose-200">{error}</p> : null}
      {data ? (
        <div className="mt-4 overflow-x-auto">
          <p className="mb-2 text-[11px] text-zinc-500">
            Checked {data.checkedSellers} seller{data.checkedSellers === 1 ? "" : "s"}
            {data.failedBalanceLookups > 0 ? ` · ${data.failedBalanceLookups} balance lookup(s) failed` : ""}. Showing
            those with $1+ available.
          </p>
          {data.rows.length === 0 ? (
            <p className="text-xs text-zinc-500">No seller has $1 or more available.</p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3">Seller</th>
                  <th className="py-2 pr-3">Available in Stripe</th>
                  <th className="py-2 pr-3">Seller can pay out</th>
                  <th className="py-2 pr-3">Stuck</th>
                  <th className="py-2 pr-3">Unspent credit</th>
                  <th className="py-2">Pending</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.username ?? "seller"}-${i}`} className="border-b border-white/5 text-zinc-300">
                    <td className="py-2 pr-3">@{r.username ?? "?"}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(r.availableUsd)}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(r.payableUsd)}</td>
                    <td className={`py-2 pr-3 tabular-nums ${r.gapUsd && r.gapUsd >= 1 ? "font-bold text-amber-300" : ""}`}>
                      {money(r.gapUsd)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{money(r.creditUsd)}</td>
                    <td className="py-2 tabular-nums">{money(r.pendingUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </section>
  );
}
