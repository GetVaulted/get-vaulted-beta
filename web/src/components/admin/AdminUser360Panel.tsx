"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminStatusPill, adminPanelClassName } from "@/components/admin/AdminCommandShell";

type OrderRow = {
  id: string;
  title: string;
  totalUsd: number;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  buyer: string;
  seller: string;
  createdAt: string;
};
type Overview = {
  totals: { boughtCount: number; boughtUsd: number; soldCount: number; soldUsd: number };
  bought: OrderRow[];
  sold: OrderRow[];
  refunds: Array<{
    id: string;
    orderId: string;
    kind: string;
    status: string;
    reason: string;
    role: "buyer" | "seller";
    buyer: string;
    seller: string;
    createdAt: string;
  }>;
  shows: Array<{ id: string; title: string; status: string; scheduledStartAt: string | null; gmvUsd: number }>;
  adminLog: Array<{ id: string; action: string; reason: string; adminUserId: string; createdAt: string }>;
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (iso: string) => new Date(iso).toLocaleDateString();

function refundTone(status: string): "ok" | "warn" | "bad" | "neutral" {
  if (status === "refunded") return "ok";
  if (status === "escalated" || status === "pending_seller" || status === "awaiting_return") return "warn";
  if (status === "seller_denied" || status.includes("fail")) return "bad";
  return "neutral";
}

function OrdersTable({ rows, empty }: { rows: OrderRow[]; empty: string }) {
  if (rows.length === 0) return <p className="mt-3 text-zinc-600">{empty}</p>;
  return (
    <ul className="mt-3 space-y-1.5">
      {rows.map((o) => (
        <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.05] pb-1.5">
          <Link href={`/admin/orders/${o.id}`} className="min-w-0 truncate text-zinc-200 hover:text-gold-bright">
            {o.title}
          </Link>
          <span className="whitespace-nowrap text-zinc-500">
            {usd(o.totalUsd)} · {o.status}/{o.paymentStatus} · {day(o.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** User 360 block: orders, refunds, shows and admin changes for one person. */
export function AdminUser360Panel({ userId }: { userId: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/overview`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as Overview;
        if (!cancelled) setData(j);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (failed) return <p className="mt-6 text-xs text-rose-300">Could not load the account overview.</p>;
  if (!data) return <p className="mt-6 text-xs text-zinc-500">Loading account overview…</p>;

  const openRefunds = data.refunds.filter((r) => ["escalated", "pending_seller", "awaiting_return", "return_in_transit", "refund_processing"].includes(r.status));

  return (
    <section className="mt-6 space-y-4 text-xs">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${adminPanelClassName} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Bought</p>
          <p className="mt-1 text-lg font-black text-zinc-100">{data.totals.boughtCount} orders</p>
          <p className="text-zinc-500">{usd(data.totals.boughtUsd)} lifetime</p>
        </div>
        <div className={`${adminPanelClassName} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Sold</p>
          <p className="mt-1 text-lg font-black text-zinc-100">{data.totals.soldCount} orders</p>
          <p className="text-zinc-500">{usd(data.totals.soldUsd)} lifetime</p>
        </div>
        <div className={`${adminPanelClassName} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Open refund requests</p>
          <p className="mt-1 text-lg font-black text-zinc-100">{openRefunds.length}</p>
          <Link href="/admin/refund-requests" className="text-gold-bright hover:underline">
            Open refund queue
          </Link>
        </div>
        <div className={`${adminPanelClassName} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Admin changes</p>
          <p className="mt-1 text-lg font-black text-zinc-100">{data.adminLog.length}</p>
          <Link href={`/admin/activity?user=${encodeURIComponent(userId)}`} className="text-gold-bright hover:underline">
            See full log
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${adminPanelClassName} p-4`}>
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Recent purchases</h2>
          <OrdersTable rows={data.bought} empty="No purchases." />
        </div>
        <div className={`${adminPanelClassName} p-4`}>
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Recent sales</h2>
          <OrdersTable rows={data.sold} empty="No sales." />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${adminPanelClassName} p-4`}>
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Refund &amp; return requests</h2>
          {data.refunds.length === 0 ? (
            <p className="mt-3 text-zinc-600">None.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.refunds.map((r) => (
                <li key={r.id} className="border-b border-white/[0.05] pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminStatusPill tone={refundTone(r.status)}>{r.status}</AdminStatusPill>
                    <span className="text-zinc-400">
                      {r.kind} · as {r.role} · @{r.buyer} → @{r.seller} · {day(r.createdAt)}
                    </span>
                    <Link href={`/admin/orders/${r.orderId}`} className="text-gold-bright hover:underline">
                      order
                    </Link>
                  </div>
                  <p className="mt-1 text-zinc-500">{r.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`${adminPanelClassName} p-4`}>
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Shows hosted</h2>
          {data.shows.length === 0 ? (
            <p className="mt-3 text-zinc-600">None.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {data.shows.map((s) => (
                <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.05] pb-1.5">
                  <Link href={`/admin/live-shows?focus=${s.id}`} className="min-w-0 truncate text-zinc-200 hover:text-gold-bright">
                    {s.title}
                  </Link>
                  <span className="whitespace-nowrap text-zinc-500">
                    {s.status} · {usd(s.gmvUsd)} · {s.scheduledStartAt ? day(s.scheduledStartAt) : "unscheduled"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {data.adminLog.length > 0 ? (
        <div className={`${adminPanelClassName} p-4`}>
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Admin changes to this account</h2>
          <ul className="mt-3 space-y-1.5">
            {data.adminLog.map((l) => (
              <li key={l.id} className="border-b border-white/[0.05] pb-1.5 text-zinc-400">
                <span className="font-mono text-zinc-300">{l.action}</span> · {new Date(l.createdAt).toLocaleString()}
                {l.reason ? <span className="block text-zinc-500">{l.reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
