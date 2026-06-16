"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";
import { AdminMetricStrip } from "@/components/admin/AdminMetricStrip";

type Summary = {
  openOrders: number;
  paidOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  disputedOrders: number;
  activeLayaways: number;
  readyToShipLayaways: number;
};

export function AdminFulfillmentPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/fulfillment/summary", { cache: "no-store" });
        if (res.ok) setData((await res.json()) as Summary);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const buckets: Array<{ label: string; value: number; status?: string; tone?: "warn" | "gold" }> = [
    { label: "Open orders", value: data?.openOrders ?? 0, status: "pending" },
    { label: "Paid orders", value: data?.paidOrders ?? 0, status: "paid" },
    { label: "Shipped orders", value: data?.shippedOrders ?? 0, status: "shipped" },
    { label: "Delivered orders", value: data?.deliveredOrders ?? 0, status: "completed", tone: "gold" },
    { label: "Disputed orders", value: data?.disputedOrders ?? 0, tone: "warn" },
    { label: "Active layaways", value: data?.activeLayaways ?? 0 },
    { label: "Ready-to-ship layaways", value: data?.readyToShipLayaways ?? 0, tone: "gold" },
  ];

  return (
    <AdminCommandShell
      title="Orders & Fulfillment"
      subtitle="Order lifecycle buckets and layaway fulfillment readiness."
      actions={
        <Link href="/admin/orders" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]">
          Legacy orders table →
        </Link>
      }
    >
      {loading ? (
        <p className="text-sm text-zinc-500">Loading fulfillment summary…</p>
      ) : (
        <>
          <AdminMetricStrip
            metrics={buckets.map((b) => ({
              label: b.label,
              value: b.value,
              tone: b.tone,
              href: b.status ? `/admin/orders?status=${b.status}` : "/admin/orders",
            }))}
          />

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {buckets.map((b) => (
              <Link
                key={b.label}
                href={b.status ? `/admin/orders?status=${b.status}` : "/admin/orders"}
                className={`${adminPanelClassName} p-4 transition hover:border-gold/20`}
              >
                <p className="text-[10px] font-bold uppercase text-zinc-500">{b.label}</p>
                <p className="mt-2 font-display text-3xl font-black text-foreground">{b.value}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </AdminCommandShell>
  );
}
