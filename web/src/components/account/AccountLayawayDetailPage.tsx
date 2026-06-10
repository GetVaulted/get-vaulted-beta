"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";

type LayawayRow = {
  id: string;
  listingTitle: string;
  listingImageUrl: string | null;
  planType: string;
  status: string;
  orderPaymentStatus: string;
  displayStatus: string;
  canMakePayment: boolean;
  statusMessage: string | null;
  depositAmountUsd: number;
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

export function AccountLayawayDetailPage({ layawayId }: { layawayId: string }) {
  const [row, setRow] = useState<LayawayRow | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialAmount, setPartialAmount] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/account/layaways/${encodeURIComponent(layawayId)}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { layaway?: LayawayRow };
    const found = data.layaway ?? null;
    if (found) {
      console.info("[AccountLayawayDetail] loaded", {
        layawayId,
        status: found.status,
        orderPaymentStatus: found.orderPaymentStatus,
        displayStatus: found.displayStatus,
        canMakePayment: found.canMakePayment,
        amountPaidUsd: found.amountPaidUsd,
        remainingBalanceUsd: found.remainingBalanceUsd,
      });
    }
    setRow(found);
  }, [layawayId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent<{ entityId?: string }>).detail;
      if (!detail?.entityId || detail.entityId === layawayId) void load();
    };
    window.addEventListener("gv-layaways-updated", on);
    return () => window.removeEventListener("gv-layaways-updated", on);
  }, [layawayId, load]);

  const startPayment = async (payRemaining: boolean) => {
    if (!row?.canMakePayment) return;
    setError(null);
    setPaying(true);
    try {
      const body: { payRemaining?: boolean; amountUsd?: number } = payRemaining ? { payRemaining: true } : {};
      if (!payRemaining) {
        const amt = Number(partialAmount);
        if (!(amt > 0)) {
          setError("Enter a valid payment amount.");
          return;
        }
        body.amountUsd = amt;
      }
      const res = await fetch(`/api/layaway/${encodeURIComponent(layawayId)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) {
        setError(data.error ?? "Payment could not start.");
        return;
      }
      if (data.url) window.location.assign(data.url);
    } catch {
      setError("Something went wrong.");
    } finally {
      setPaying(false);
    }
  };

  if (!row) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  const showCompleted = row.status === "completed" || row.status === "paid_off" || row.remainingBalanceUsd <= 0;

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="relative mx-auto w-full max-w-3xl px-3 pb-20 pt-6 sm:px-4 lg:px-10">
        <AccountOrdersNav active="layaways" />
        <Link href="/account/layaways" className="mt-4 inline-flex text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 hover:text-gold-bright">
          ← All layaways
        </Link>
        <header className="mt-4 border-b border-white/[0.07] pb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-black tracking-tight text-foreground">{row.listingTitle}</h1>
            <span className="rounded-full border border-gold/35 bg-gold/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gold-bright">
              {row.displayStatus}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-zinc-500">
            {row.planType === "sixty_day" ? "60-day" : "30-day"} plan · Due {formatDate(row.dueAt)}
          </p>
        </header>

        <dl className="mt-8 space-y-3 rounded-xl border border-white/[0.08] bg-[#08080a]/90 p-5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Deposit (non-refundable)</dt>
            <dd className="font-mono font-semibold text-zinc-200">{formatMoney(row.depositAmountUsd)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Amount paid</dt>
            <dd className="font-mono font-semibold text-zinc-200">{formatMoney(row.amountPaidUsd)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-white/[0.06] pt-3">
            <dt className="font-semibold text-zinc-300">Remaining balance</dt>
            <dd className="font-mono text-base font-bold text-gold-bright">{formatMoney(row.remainingBalanceUsd)}</dd>
          </div>
        </dl>

        {row.statusMessage ? (
          <p className="mt-6 rounded-xl border border-white/[0.08] bg-[#08080a]/90 p-4 text-sm text-zinc-400">{row.statusMessage}</p>
        ) : null}

        {row.canMakePayment ? (
          <div className="mt-6 space-y-4 rounded-xl border border-white/[0.08] bg-[#08080a]/90 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Make a payment</p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-400">Partial amount (USD)</span>
              <input
                inputMode="decimal"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder={`Up to ${row.remainingBalanceUsd.toFixed(2)}`}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm outline-none focus:border-gold/40"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={paying}
                onClick={() => void startPayment(false)}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-sm font-semibold text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50"
              >
                Make payment
              </button>
              <button
                type="button"
                disabled={paying}
                onClick={() => void startPayment(true)}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 disabled:opacity-50"
              >
                Pay remaining balance
              </button>
            </div>
          </div>
        ) : showCompleted ? (
          <Link href={`/orders/${encodeURIComponent(row.orderId)}`} className="mt-6 inline-flex text-sm font-semibold text-gold-bright hover:underline">
            View order →
          </Link>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </div>
    </main>
  );
}
