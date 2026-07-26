"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, formatAdminUsd } from "@/components/admin/AdminCommandShell";
import { AdminMetricStrip } from "@/components/admin/AdminMetricStrip";
import { AdminModuleGrid } from "@/components/admin/AdminModuleGrid";
import { ADMIN_MODULES } from "@/lib/admin/admin-modules";

type Overview = {
  liveActive: number;
  liveScheduled: number;
  openReports: number;
  pendingListings: number;
  flaggedListings: number;
  openOrders: number;
  activeLayaways: number;
  sellersPendingPayoutReview: number;
  suspendedUsers: number;
  onlineNow: number;
  onlineByPlatform: { ios: number; android: number; web: number };
  finance: { gmvUsd: number | null; platformFeesUsd: number | null; pendingPayoutsUsd: number | null };
  updatedAt: string;
};

const ONLINE_REFRESH_MS = 30_000;

export function AdminCommandCenterPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      if (!res.ok) return;
      setData((await res.json()) as Overview);
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load({ quiet: true });
    }, ONLINE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const by = data?.onlineByPlatform;
  const onlineHint = by
    ? `iOS ${by.ios} · Android ${by.android} · Web ${by.web} · last 2 min`
    : "Signed-in, last 2 min";

  return (
    <AdminCommandShell
      title="Operations Command Center"
      subtitle="Real-time marketplace health, live commerce, payouts, trust & safety, and platform status."
      actions={
        <button type="button" onClick={() => void load()} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]">
          Refresh
        </button>
      }
    >
      {loading && !data ? (
        <p className="text-sm text-zinc-500">Loading command center metrics…</p>
      ) : (
        <>
          <AdminMetricStrip
            metrics={[
              {
                label: "Online now",
                value: data?.onlineNow ?? 0,
                hint: onlineHint,
                tone: "gold",
              },
              { label: "Live shows", value: data?.liveActive ?? 0, href: "/admin/live-shows", tone: "gold" },
              { label: "Scheduled shows", value: data?.liveScheduled ?? 0, href: "/admin/live-shows" },
              { label: "Open reports", value: data?.openReports ?? 0, href: "/admin/trust", tone: "warn" },
              { label: "Pending listings", value: data?.pendingListings ?? 0, href: "/admin/moderation" },
              { label: "GMV (recent paid)", value: data?.finance?.gmvUsd ?? null, hint: "Item subtotal, paid orders sample", tone: "gold" },
              { label: "Platform fees", value: data?.finance?.platformFeesUsd ?? null, href: "/admin/finance" },
              { label: "Pending payouts", value: data?.finance?.pendingPayoutsUsd ?? null, href: "/admin/seller-risk" },
              { label: "Active layaways", value: data?.activeLayaways ?? 0, href: "/admin/fulfillment" },
              { label: "Payout reviews", value: data?.sellersPendingPayoutReview ?? 0, href: "/admin/seller-risk", tone: "warn" },
              { label: "Suspended users", value: data?.suspendedUsers ?? 0, href: "/admin/users-management" },
            ]}
          />

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-foreground">Ops modules</h2>
            <p className="text-xs text-zinc-600">
              Updated {data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : "—"} · Finance uses real order aggregates (sample capped)
            </p>
          </div>

          <div className="mt-4">
            <AdminModuleGrid />
          </div>

          <div className="mt-10 rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Legacy routes (unchanged)</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {ADMIN_MODULES.filter((m) => ["listings", "orders", "reports", "tax"].includes(m.id)).map((m) => (
                <li key={m.id}>
                  <Link href={m.href} className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-zinc-400 hover:text-gold-bright">
                    {m.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {data?.finance?.gmvUsd != null ? (
            <p className="mt-4 text-[11px] text-zinc-600">
              Snapshot GMV {formatAdminUsd(data.finance.gmvUsd)} · Fees {formatAdminUsd(data.finance.platformFeesUsd)} · Pending payouts{" "}
              {formatAdminUsd(data.finance.pendingPayoutsUsd)}
            </p>
          ) : null}
        </>
      )}
    </AdminCommandShell>
  );
}
