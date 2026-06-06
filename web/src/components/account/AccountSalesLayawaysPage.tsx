"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import { useRequireSellerActivation } from "@/hooks/useRequireSellerActivation";

type LayawayRow = {
  id: string;
  listingTitle: string;
  buyerUsername: string;
  status: string;
  amountPaidUsd: number;
  remainingBalanceUsd: number;
  dueAt: string;
};

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

const TABS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Paid off" },
  { key: "defaulted", label: "Defaulted" },
] as const;

export function AccountSalesLayawaysPage() {
  const { status } = useSession();
  const { ready: sellerReady, loading: sellerGateLoading } = useRequireSellerActivation();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("active");
  const [rows, setRows] = useState<LayawayRow[] | null>(null);

  const load = useCallback(async () => {
    const qs = tab ? `?status=${encodeURIComponent(tab)}` : "";
    const res = await fetch(`/api/account/sales/layaways${qs}`, { cache: "no-store" });
    if (!res.ok) {
      setRows([]);
      return;
    }
    const data = (await res.json()) as { layaways?: LayawayRow[] };
    setRows(Array.isArray(data.layaways) ? data.layaways : []);
  }, [tab]);

  useEffect(() => {
    if (status === "authenticated" && sellerReady) void load();
  }, [load, sellerReady, status]);

  if (status === "loading" || sellerGateLoading || rows === null) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-20 pt-6 sm:px-4 lg:px-10">
        <AccountOrdersNav active="sales" />
        <header className="mt-6 border-b border-white/[0.07] pb-6">
          <Link href="/account/sales" className="text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 hover:text-gold-bright">
            ← Sales
          </Link>
          <h1 className="font-display mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Layaways</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Items reserved on layaway. Shipping unlocks when paid in full.</p>
        </header>

        <div className="mt-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key || "all"}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                tab === t.key
                  ? "border-gold/45 bg-gold/12 text-gold-bright"
                  : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">No layaways in this view.</p>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-black uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Listing</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Remaining</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {rows.map((r) => (
                  <tr key={r.id} className="bg-[#08080a]/60">
                    <td className="px-4 py-3 font-medium text-zinc-200">{r.listingTitle}</td>
                    <td className="px-4 py-3 text-zinc-400">@{r.buyerUsername}</td>
                    <td className="px-4 py-3 font-mono text-zinc-300">{formatMoney(r.amountPaidUsd)}</td>
                    <td className="px-4 py-3 font-mono text-zinc-300">{formatMoney(r.remainingBalanceUsd)}</td>
                    <td className="px-4 py-3 text-zinc-400">{formatDate(r.dueAt)}</td>
                    <td className="px-4 py-3 capitalize text-zinc-400">{r.status.replace(/_/g, " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
