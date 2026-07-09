"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AdminCommandShell,
  adminPanelClassName,
  adminSelectClassName,
  adminTableClassName,
  formatAdminPct,
  formatAdminUsd,
} from "@/components/admin/AdminCommandShell";
import { AdminCsvExportButton } from "@/components/admin/AdminCsvExportButton";

type SellerRow = {
  id: string;
  username: string;
  email: string;
  payoutTier: string;
  fastPayoutStatus: string;
  instantPayoutApprovalStatus: string;
  instantPayoutStatus: string;
  instantPayoutEligible: boolean;
  suspensionReason: string | null;
  metrics: {
    lifetimeGmvUsd: number;
    cancellationRate: number;
    chargebackRate: number;
    disputeRate: number;
    accountStanding: string;
    payoutExposureUsd: number;
  } | null;
};

export function AdminSellerRiskPage() {
  const [tier, setTier] = useState("all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (tier !== "all") sp.set("tier", tier);
      if (pendingOnly) sp.set("pending", "1");
      const res = await fetch(`/api/admin/seller-risk?${sp}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { sellers?: SellerRow[] };
      setRows(Array.isArray(j.sellers) ? j.sellers : []);
    } finally {
      setLoading(false);
    }
  }, [tier, pendingOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminCommandShell
      title="Seller Risk & Payout Review"
      subtitle="Review payout tiers, GMV, standing, and dispute rates. Suspend or restore via seller detail."
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-zinc-500">
          Tier
          <select value={tier} onChange={(e) => setTier(e.target.value)} className={adminSelectClassName}>
            <option value="all">All sellers</option>
            <option value="standard">Standard</option>
            <option value="fast">Fast</option>
            <option value="instant">Instant</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
          Pending approval only
        </label>
        <AdminCsvExportButton
          report="seller-risk"
          params={{ tier: tier === "all" ? undefined : tier, pending: pendingOnly ? "1" : undefined }}
        />
      </div>

      <div className={`mt-6 overflow-x-auto ${adminPanelClassName}`}>
        <table className={adminTableClassName}>
          <thead>
            <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase text-zinc-500">
              <th>Seller</th>
              <th>Tier</th>
              <th>GMV</th>
              <th>Standing</th>
              <th>Cancel</th>
              <th>Chargeback</th>
              <th>Dispute</th>
              <th>Exposure</th>
              <th className="text-right">Review</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-zinc-500">
                  No sellers match filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04] text-zinc-300">
                  <td>
                    <p className="font-semibold text-zinc-100">{r.username}</p>
                    <p className="text-[10px] text-zinc-600">{r.email}</p>
                    {r.suspensionReason ? <p className="mt-1 text-[10px] text-rose-400">{r.suspensionReason}</p> : null}
                  </td>
                  <td>
                    <p>{r.payoutTier}</p>
                    <p className="text-[10px] text-zinc-600">
                      fast {r.fastPayoutStatus} · instant {r.instantPayoutApprovalStatus}
                    </p>
                  </td>
                  <td>{formatAdminUsd(r.metrics?.lifetimeGmvUsd ?? 0)}</td>
                  <td>{r.metrics?.accountStanding ?? "—"}</td>
                  <td>{formatAdminPct(r.metrics?.cancellationRate)}</td>
                  <td>{formatAdminPct(r.metrics?.chargebackRate)}</td>
                  <td>{formatAdminPct(r.metrics?.disputeRate)}</td>
                  <td>{formatAdminUsd(r.metrics?.payoutExposureUsd ?? 0)}</td>
                  <td className="text-right">
                    <Link href={`/admin/users/${r.id}`} className="text-xs font-semibold text-gold-bright hover:underline">
                      Open seller →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminCommandShell>
  );
}
