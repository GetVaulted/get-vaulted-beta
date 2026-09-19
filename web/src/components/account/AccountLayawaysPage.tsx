"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";

type LayawayRow = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImageUrl: string | null;
  planType: string;
  status: string;
  displayStatus?: string;
  canMakePayment?: boolean;
  amountPaidUsd: number;
  remainingBalanceUsd: number;
  dueAt: string;
  orderId: string;
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

function statusLabel(s: string): string {
  if (s === "active") return "Active";
  if (s === "completed") return "Paid off";
  if (s === "defaulted") return "Defaulted";
  return s.replace(/_/g, " ");
}

export function AccountLayawaysPage() {
  const { status } = useSession();
  const [rows, setRows] = useState<LayawayRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/account/layaways", { cache: "no-store" });
    if (!res.ok) {
      setRows([]);
      setLoadError(res.status === 401 ? "Please sign in again." : "Could not load layaways.");
      return;
    }
    const data = (await res.json()) as { layaways?: LayawayRow[] };
    setRows(Array.isArray(data.layaways) ? data.layaways : []);
  }, []);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  useEffect(() => {
    const on = () => void load();
    window.addEventListener("gv-layaways-updated", on);
    return () => window.removeEventListener("gv-layaways-updated", on);
  }, [load]);

  if (status === "loading" || rows === null) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-20 pt-6 sm:px-4 lg:px-10">
        <AccountOrdersNav active="layaways" mode="buyer" />
        <header className="mt-6 border-b border-white/[0.07] pb-6">
          <h1 className="font-display text-2xl font-black tracking-tight text-foreground sm:text-3xl">My layaways</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Reserve high-value items with a deposit and pay over time.</p>
        </header>

        {loadError ? <p className="mt-6 text-sm text-rose-300">{loadError}</p> : null}

        {rows.length === 0 ? (
          <p className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">
            No layaways yet. Browse marketplace listings with layaway available.
          </p>
        ) : (
          <ul className="mt-8 space-y-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/account/layaways/${encodeURIComponent(r.id)}`}
                  className="flex gap-4 rounded-xl border border-white/[0.08] bg-[#08080a]/90 p-4 transition hover:border-white/14"
                >
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-[#0c0c10]">
                    {r.listingImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.listingImageUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-100">{r.listingTitle}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {r.displayStatus ?? statusLabel(r.status)} · Due {formatDate(r.dueAt)}
                    </p>
                    <p className="mt-2 font-mono text-sm text-zinc-300">
                      Paid {formatMoney(r.amountPaidUsd)} · {formatMoney(r.remainingBalanceUsd)} remaining
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
