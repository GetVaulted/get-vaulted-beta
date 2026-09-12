"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import { offerStatusLabel, offerStatusTone } from "@/lib/offer-status";

type OfferRow = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingThumb: string | null;
  sellerUsername: string;
  amountUsd: number;
  message: string | null;
  status: string;
  counterAmountUsd: number | null;
  createdAt: string;
  updatedAt: string;
  orderId: string | null;
};

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

export function AccountOffersPage() {
  const router = useRouter();
  const { status } = useSession();
  const [rows, setRows] = useState<OfferRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/account/offers");
    if (!res.ok) {
      setRows([]);
      setLoadError("Could not load your offers. Refresh and try again.");
      return;
    }
    setLoadError(null);
    const data = (await res.json()) as { offers?: Partial<OfferRow>[] };
    setRows(
      Array.isArray(data.offers)
        ? data.offers.map((o) => ({
            id: String(o.id),
            listingId: String(o.listingId),
            listingTitle: String(o.listingTitle ?? ""),
            listingThumb: o.listingThumb ?? null,
            sellerUsername: String(o.sellerUsername ?? ""),
            amountUsd: Number(o.amountUsd) || 0,
            message: o.message ?? null,
            status: String(o.status ?? ""),
            counterAmountUsd: o.counterAmountUsd ?? null,
            createdAt: String(o.createdAt ?? ""),
            updatedAt: String(o.updatedAt ?? ""),
            orderId: typeof o.orderId === "string" ? o.orderId : null,
          }))
        : [],
    );
  }, []);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  const patch = async (offerId: string, body: Record<string, unknown>, opts?: { redirectToOrder?: boolean }) => {
    setActionError(null);
    setBusyId(offerId);
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(offerId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; orderId?: string };
      if (!res.ok) {
        setActionError(typeof data.error === "string" ? data.error : "Could not update offer.");
        return;
      }
      if (opts?.redirectToOrder && typeof data.orderId === "string") {
        router.push(`/orders/${encodeURIComponent(data.orderId)}`);
        router.refresh();
        return;
      }
      await load();
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (status === "loading" || rows === null) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(360px,50vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <header className="border-b border-white/[0.07] pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Account</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Your offers</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Offers you have sent on listings.</p>
          <div className="mt-4">
            <AccountOrdersNav active="offers" mode="seller" />
          </div>
        </header>

        {loadError ? (
          <p className="mt-6 rounded-lg border border-rose-400/25 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{loadError}</p>
        ) : null}
        {actionError ? (
          <p className="mt-6 rounded-lg border border-rose-400/25 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{actionError}</p>
        ) : null}

        {loadError ? null : rows.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-16 text-center">
            <p className="font-display text-lg font-semibold text-foreground">You haven&apos;t made any offers yet.</p>
            <p className="mt-2 text-sm text-zinc-500">When you negotiate on a listing, your offers appear here.</p>
            <Link
              href="/marketplace"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110"
            >
              Browse marketplace
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-8 hidden overflow-hidden rounded-xl border border-white/[0.08] bg-[#08080a] md:block">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-2.5 pl-3.5">Item</th>
                    <th className="px-2 py-2.5">Seller</th>
                    <th className="px-2 py-2.5">Your offer</th>
                    <th className="px-2 py-2.5">Counter</th>
                    <th className="px-2 py-2.5">Status</th>
                    <th className="px-2 py-2.5">Updated</th>
                    <th className="px-3 py-2.5 pr-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const thumb = o.listingThumb;
                    const busy = busyId === o.id;
                    const countered = o.status === "countered";
                    return (
                      <tr key={o.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 pl-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="relative size-11 shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#0b0b0e]">
                              {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-[9px] text-zinc-600">—</div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/marketplace/${encodeURIComponent(o.listingId)}`}
                                className="line-clamp-2 font-medium leading-snug text-zinc-100 hover:text-gold-bright"
                              >
                                {o.listingTitle}
                              </Link>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-xs text-zinc-400">@{o.sellerUsername}</td>
                        <td className="px-2 py-2.5 font-mono text-xs font-semibold tabular-nums text-zinc-200">{formatMoney(o.amountUsd)}</td>
                        <td className="px-2 py-2.5 font-mono text-xs tabular-nums text-zinc-400">
                          {o.counterAmountUsd != null ? formatMoney(o.counterAmountUsd) : "—"}
                        </td>
                        <td className="px-2 py-2.5">
                          <span className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${offerStatusTone(o.status)}`}>
                            {offerStatusLabel(o.status)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-xs tabular-nums text-zinc-500">{formatDate(o.updatedAt)}</td>
                        <td className="px-3 py-2.5 pr-3.5 text-right">
                          {countered ? (
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void patch(o.id, { action: "accept_counter" }, { redirectToOrder: true })}
                                className="rounded-md border border-emerald-400/35 bg-emerald-950/25 px-2 py-1 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-950/40 disabled:opacity-50"
                              >
                                {busy ? "Working…" : "Accept"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void patch(o.id, { action: "decline_counter" })}
                                className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-white/20 disabled:opacity-50"
                              >
                                {busy ? "Working…" : "Decline"}
                              </button>
                            </div>
                          ) : o.status === "accepted" ? (
                            o.orderId ? (
                              <Link
                                href={`/orders/${encodeURIComponent(o.orderId)}`}
                                className="text-[11px] font-semibold text-gold-bright hover:underline"
                              >
                                View order
                              </Link>
                            ) : (
                              <Link
                                href="/account/orders"
                                className="text-[11px] font-semibold text-gold-bright hover:underline"
                              >
                                View orders
                              </Link>
                            )
                          ) : (
                            <span className="text-[11px] text-zinc-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 space-y-3 md:hidden">
              {rows.map((o) => {
                const thumb = o.listingThumb;
                const busy = busyId === o.id;
                const countered = o.status === "countered";
                return (
                  <div key={o.id} className="rounded-xl border border-white/[0.08] bg-[#0a0a0d] p-3.5">
                    <div className="flex gap-3">
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0b0b0e]">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">—</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/marketplace/${encodeURIComponent(o.listingId)}`} className="font-medium leading-snug text-zinc-100 hover:text-gold-bright">
                          {o.listingTitle}
                        </Link>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          @{o.sellerUsername} · Updated {formatDate(o.updatedAt)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${offerStatusTone(o.status)}`}>
                            {offerStatusLabel(o.status)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3 text-xs">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Your offer</p>
                        <p className="mt-0.5 font-mono font-semibold text-zinc-200">{formatMoney(o.amountUsd)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Counter</p>
                        <p className="mt-0.5 font-mono text-zinc-300">{o.counterAmountUsd != null ? formatMoney(o.counterAmountUsd) : "—"}</p>
                      </div>
                    </div>
                    {countered ? (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patch(o.id, { action: "accept_counter" }, { redirectToOrder: true })}
                          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-emerald-400/35 bg-emerald-950/25 text-xs font-bold text-emerald-100 disabled:opacity-50"
                        >
                          {busy ? "Working…" : "Accept counter"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patch(o.id, { action: "decline_counter" })}
                          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-white/12 text-xs font-semibold text-zinc-400 disabled:opacity-50"
                        >
                          {busy ? "Working…" : "Decline"}
                        </button>
                      </div>
                    ) : o.status === "accepted" ? (
                      <div className="mt-3">
                        {o.orderId ? (
                          <Link
                            href={`/orders/${encodeURIComponent(o.orderId)}`}
                            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gold/35 bg-gold/10 text-xs font-bold text-gold-bright"
                          >
                            View order
                          </Link>
                        ) : (
                          <Link
                            href="/account/orders"
                            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-white/12 text-xs font-semibold text-gold-bright"
                          >
                            View orders
                          </Link>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
