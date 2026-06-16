"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminPanelClassName,
  adminSelectClassName,
  adminTableClassName,
} from "@/components/admin/AdminCommandShell";
import { AdminMetricStrip } from "@/components/admin/AdminMetricStrip";

type UserRow = {
  id: string;
  email: string;
  username: string;
  role: string;
  suspendedAt: string | null;
  emailVerified: string | null;
  stripeConnect: {
    accountId: string | null;
    onboardingComplete: boolean;
    payoutsEnabled: boolean | null;
    verificationStatus: string | null;
  };
  sellerOnboardingComplete: string | null;
  listingCount: number;
  buyerOrderCount: number;
  sellerOrderCount: number;
};

type Payload = {
  counts: { admins: number; suspended: number; sellers: number; buyers: number };
  users: UserRow[];
};

export function AdminUsersManagementPage() {
  const [segment, setSegment] = useState("all");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (segment !== "all") sp.set("segment", segment);
      if (appliedQ) sp.set("q", appliedQ);
      const res = await fetch(`/api/admin/users/segments?${sp}`, { cache: "no-store" });
      if (res.ok) setData((await res.json()) as Payload);
    } finally {
      setLoading(false);
    }
  }, [segment, appliedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminCommandShell
      title="User Management"
      subtitle="Buyers, sellers, admins, suspension state, verification, Stripe Connect, and seller onboarding."
      actions={
        <Link href="/admin/users" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]">
          Legacy users search →
        </Link>
      }
    >
      <AdminMetricStrip
        metrics={[
          { label: "Buyers", value: data?.counts.buyers ?? 0 },
          { label: "Sellers", value: data?.counts.sellers ?? 0, tone: "gold" },
          { label: "Admins", value: data?.counts.admins ?? 0 },
          { label: "Suspended", value: data?.counts.suspended ?? 0, tone: "warn" },
        ]}
      />

      <div className="mt-6 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-zinc-500">
          Segment
          <select value={segment} onChange={(e) => setSegment(e.target.value)} className={adminSelectClassName}>
            <option value="all">All</option>
            <option value="buyers">Buyers</option>
            <option value="sellers">Sellers</option>
            <option value="admin">Admins</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <label className="min-w-[14rem] flex-1 text-[10px] font-bold uppercase text-zinc-500">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setAppliedQ(q.trim())}
            className="mt-1 block w-full rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
            placeholder="email or username"
          />
        </label>
        <button type="button" onClick={() => setAppliedQ(q.trim())} className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold-bright">
          Apply
        </button>
      </div>

      <div className={`mt-6 overflow-x-auto ${adminPanelClassName}`}>
        <table className={adminTableClassName}>
          <thead>
            <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase text-zinc-500">
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Stripe Connect</th>
              <th>Seller onboarding</th>
              <th>Activity</th>
              <th className="text-right">Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : (data?.users ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-zinc-500">
                  No users match.
                </td>
              </tr>
            ) : (
              data?.users.map((u) => (
                <tr key={u.id} className="border-b border-white/[0.04] text-zinc-300">
                  <td>
                    <p className="font-semibold text-zinc-100">{u.username}</p>
                    <p className="text-[10px] text-zinc-600">{u.email}</p>
                  </td>
                  <td>{u.role}</td>
                  <td>
                    {u.suspendedAt ? (
                      <AdminStatusPill tone="bad">Suspended</AdminStatusPill>
                    ) : (
                      <AdminStatusPill tone={u.emailVerified ? "ok" : "warn"}>
                        {u.emailVerified ? "Verified" : "Unverified"}
                      </AdminStatusPill>
                    )}
                  </td>
                  <td className="text-[10px]">
                    {u.stripeConnect.accountId ? (
                      <>
                        <p>{u.stripeConnect.onboardingComplete ? "Onboarded" : "Incomplete"}</p>
                        <p className="text-zinc-600">Payouts {u.stripeConnect.payoutsEnabled ? "on" : "off"}</p>
                      </>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="text-[10px]">{u.sellerOnboardingComplete ? "Complete" : u.listingCount > 0 ? "Partial" : "—"}</td>
                  <td className="text-[10px] text-zinc-500">
                    {u.listingCount} listings · {u.buyerOrderCount} buys · {u.sellerOrderCount} sales
                  </td>
                  <td className="text-right">
                    <Link href={`/admin/users/${u.id}`} className="text-xs font-semibold text-gold-bright hover:underline">
                      Open
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
