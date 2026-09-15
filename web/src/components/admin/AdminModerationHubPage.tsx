"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";
import { AdminMetricStrip } from "@/components/admin/AdminMetricStrip";

type Summary = {
  pendingReview: number;
  flaggedRemoved: number;
  vaultVerified: number;
  draftListings: number;
  reviewedActive: number;
  priceAnomalyReview: number;
  categoryReview: Array<{ category: string; listingCount: number; medianPriceUsd: number; anomalyCount: number }>;
  note: string;
};

export function AdminModerationHubPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/moderation/summary", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as Summary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminCommandShell
      title="Marketplace Moderation"
      subtitle="Listing review queues, Vault Verified inventory, category coverage, and price anomaly heuristics."
      actions={
        <Link href="/admin/listings" className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold-bright hover:bg-gold/25">
          Full listings table →
        </Link>
      }
    >
      {loading && !data ? (
        <p className="text-sm text-zinc-500">Loading moderation summary…</p>
      ) : (
        <>
          <AdminMetricStrip
            metrics={[
              { label: "Pending review", value: data?.pendingReview ?? 0, href: "/admin/listings", tone: "warn" },
              {
                label: "Removed / flagged",
                value: data?.flaggedRemoved ?? 0,
                href: "/admin/listings?status=removed&channel=marketplace",
              },
              { label: "Vault Verified", value: data?.vaultVerified ?? 0, tone: "gold" },
              { label: "Draft listings", value: data?.draftListings ?? 0 },
              { label: "Reviewed active", value: data?.reviewedActive ?? 0 },
              { label: "Price anomalies", value: data?.priceAnomalyReview ?? 0, tone: "warn" },
            ]}
          />

          <section className={`mt-8 ${adminPanelClassName} p-5`}>
            <h2 className="text-sm font-bold text-gold-bright">Category review</h2>
            <ul className="mt-4 divide-y divide-white/[0.04]">
              {(data?.categoryReview ?? []).map((c) => (
                <li key={c.category} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="text-zinc-200">{c.category}</span>
                  <span className="text-xs text-zinc-500">
                    {c.listingCount} active · median ${c.medianPriceUsd.toLocaleString()} · {c.anomalyCount} anomalies
                  </span>
                </li>
              ))}
            </ul>
            {data?.note ? <p className="mt-4 text-xs text-zinc-600">{data.note}</p> : null}
          </section>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href="/admin/listings" className={`${adminPanelClassName} p-4 hover:border-gold/20`}>
              <p className="text-sm font-bold text-zinc-200">Pending & active listings</p>
              <p className="mt-1 text-xs text-zinc-500">Remove, restore, mark reviewed, company listing flag.</p>
            </Link>
            <Link href="/admin/listings/new" className={`${adminPanelClassName} p-4 hover:border-gold/20`}>
              <p className="text-sm font-bold text-zinc-200">Create company listing</p>
              <p className="mt-1 text-xs text-zinc-500">Official Get Vaulted merch / zero platform fee listings.</p>
            </Link>
          </div>
        </>
      )}
    </AdminCommandShell>
  );
}
