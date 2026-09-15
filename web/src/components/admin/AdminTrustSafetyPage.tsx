"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";
import { AdminMetricStrip } from "@/components/admin/AdminMetricStrip";

type ReportCounts = {
  user: number;
  listing: number;
  live_room: number;
  message: number;
  order: number;
};

export function AdminTrustSafetyPage() {
  const [openTotal, setOpenTotal] = useState(0);
  const [byType, setByType] = useState<ReportCounts>({ user: 0, listing: 0, live_room: 0, message: 0, order: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reports?status=open", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { reports?: Array<{ targetType: string }> };
      const rows = Array.isArray(j.reports) ? j.reports : [];
      setOpenTotal(rows.length);
      const counts: ReportCounts = { user: 0, listing: 0, live_room: 0, message: 0, order: 0 };
      for (const r of rows) {
        if (r.targetType in counts) counts[r.targetType as keyof ReportCounts] += 1;
      }
      setByType(counts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = [
    { label: "User reports", value: byType.user, href: "/admin/reports?targetType=user" },
    { label: "Listing reports", value: byType.listing, href: "/admin/reports?targetType=listing" },
    { label: "Live show reports", value: byType.live_room, href: "/admin/reports?targetType=live_room" },
    { label: "Chat / message reports", value: byType.message, href: "/admin/reports?targetType=message" },
    { label: "Order reports", value: byType.order, href: "/admin/reports?targetType=order" },
  ];

  return (
    <AdminCommandShell
      title="Reports & Trust & Safety"
      subtitle="Unified trust queue across users, listings, live shows, chat, and orders."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/support-tickets" className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold-bright hover:bg-gold/25">
            Support tickets →
          </Link>
          <Link href="/admin/refund-requests" className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold-bright hover:bg-gold/25">
            Refund escalations →
          </Link>
          <Link href="/admin/reports" className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold-bright hover:bg-gold/25">
            Open report queue →
          </Link>
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-zinc-500">Loading trust metrics…</p>
      ) : (
        <>
          <AdminMetricStrip
            metrics={[
              { label: "Open reports", value: openTotal, tone: "warn", href: "/admin/reports?status=open" },
              ...cards.map((c) => ({ label: c.label, value: c.value, href: c.href })),
              {
                label: "Linked accounts",
                value: null,
                hint: "Review multi-account signal clusters",
                tone: "warn" as const,
                href: "/admin/trust/linked-accounts",
              },
            ]}
          />

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {cards.map((c) => (
              <Link key={c.label} href={c.href} className={`${adminPanelClassName} p-4 hover:border-gold/20`}>
                <p className="text-sm font-bold text-zinc-200">{c.label}</p>
                <p className="mt-2 font-display text-2xl font-black text-gold-bright">{c.value}</p>
                <p className="mt-1 text-xs text-zinc-500">Open reports in queue</p>
              </Link>
            ))}
            <div className={`${adminPanelClassName} p-4`}>
              <p className="text-sm font-bold text-zinc-200">Possible linked accounts</p>
              <p className="mt-2 text-xs text-zinc-500">
                Review-only clusters sharing Stripe IDs, payment methods, push tokens, or email aliases.
              </p>
              <Link
                href="/admin/trust/linked-accounts"
                className="mt-3 inline-block text-xs font-semibold text-gold-bright hover:underline"
              >
                Open linked-account scan →
              </Link>
            </div>
          </div>
        </>
      )}
    </AdminCommandShell>
  );
}
