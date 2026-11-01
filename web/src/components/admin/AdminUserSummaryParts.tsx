"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminUserSummary } from "@/app/api/admin/users/[id]/summary/route";

/** Shared pieces of the admin user snapshot (search preview + profile header). */

export function useAdminUserSummary(userId: string | null): {
  summary: AdminUserSummary | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
} {
  // Results are tagged with the user they belong to, so switching users never shows the previous one's data.
  const [result, setResult] = useState<{ userId: string; summary: AdminUserSummary | null; error: string | null } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const ctrl = new AbortController();
    fetch(`/api/admin/users/${encodeURIComponent(userId)}/summary`, { cache: "no-store", signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "User not found." : "Could not load this user.");
        setResult({ userId, summary: (await res.json()) as AdminUserSummary, error: null });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setResult({ userId, summary: null, error: e instanceof Error ? e.message : "Could not load this user." });
      });
    return () => ctrl.abort();
  }, [userId, nonce]);

  const current = result && result.userId === userId ? result : null;
  return {
    summary: current?.summary ?? null,
    error: current?.error ?? null,
    loading: Boolean(userId) && !current,
    reload: () => setNonce((n) => n + 1),
  };
}

export const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 && Math.abs(n) >= 1000 ? 0 : 2, maximumFractionDigits: 2 })}`;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function initialsFor(s: AdminUserSummary["user"]): string {
  const src = (s.name || s.username || s.email || "?").replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

type Tone = "gold" | "good" | "warn" | "bad" | "neutral" | "info";

const TONE: Record<Tone, string> = {
  gold: "bg-gold/15 text-gold-bright",
  good: "bg-teal-300/10 text-teal-300",
  warn: "bg-amber-300/10 text-amber-300",
  bad: "bg-red-400/10 text-red-300",
  neutral: "bg-white/[0.07] text-zinc-300",
  info: "bg-blue-300/10 text-blue-300",
};

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>{children}</span>;
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/[0.08] bg-[#121216] p-5 ${className}`}>
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function UserTags({ summary }: { summary: AdminUserSummary }) {
  const u = summary.user;
  const roleLabel = u.role === "admin" ? "Admin" : u.isSeller ? (summary.buyer.paidOrders > 0 ? "Buyer + Seller" : "Seller") : "Buyer";
  const riskTone: Tone = u.payoutRiskLevel === "high" ? "bad" : u.payoutRiskLevel === "medium" ? "warn" : "good";
  return (
    <div className="flex flex-wrap gap-1.5">
      <Pill tone="gold">{roleLabel}</Pill>
      {u.phoneVerified ? <Pill tone="good">Phone verified</Pill> : <Pill tone="neutral">Phone not verified</Pill>}
      {u.isSeller ? <Pill tone={riskTone}>Seller risk: {u.payoutRiskLevel}</Pill> : null}
      {u.suspendedAt ? <Pill tone="bad">Suspended</Pill> : null}
      {u.purchasesLocked ? <Pill tone="bad">Buying locked</Pill> : null}
      {u.sellerLocked ? <Pill tone="bad">Seller locked</Pill> : null}
    </div>
  );
}

export function UserAlerts({ summary }: { summary: AdminUserSummary }) {
  if (summary.alerts.length === 0) return null;
  const danger = summary.alerts.some((a) => a.tone === "danger");
  return (
    <div
      role="status"
      className={`flex flex-col gap-1.5 rounded-xl border px-4 py-3 text-[13px] ${
        danger ? "border-red-400/30 bg-red-400/[0.07] text-red-100" : "border-orange-400/30 bg-orange-400/[0.07] text-orange-100"
      }`}
    >
      <p className={`font-semibold ${danger ? "text-red-300" : "text-orange-300"}`}>
        Needs attention ({summary.alerts.length})
      </p>
      {summary.alerts.map((a, i) => (
        <div key={i} className="flex flex-wrap items-baseline gap-x-3">
          <span className="flex-1">{a.text}</span>
          {a.href ? (
            <Link href={a.href} className="text-orange-300 hover:text-orange-200">
              Open →
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function UserStatTiles({ summary, compact = false }: { summary: AdminUserSummary; compact?: boolean }) {
  const s = summary;
  const tiles: Array<{ label: string; value: string; sub: string; tone?: "gold" | "good" | "warn" }> = [
    { label: "Spent as buyer", value: fmtUsd(s.buyer.spentUsd), sub: `${s.buyer.paidOrders} paid orders` },
    { label: "Sold as seller", value: fmtUsd(s.seller.soldUsd), sub: `${s.seller.paidSales} paid sales` },
    {
      label: "Not yet paid out",
      value: fmtUsd(s.seller.unpaidUsd),
      sub: s.seller.heldUsd > 0 ? `${fmtUsd(s.seller.heldUsd)} on fraud hold` : `${s.seller.unpaidSales} sales`,
      tone: "gold",
    },
    {
      label: "Refund rate",
      value: s.refunds.ratePct == null ? "—" : `${s.refunds.ratePct.toFixed(1)}%`,
      sub: `${s.refunds.count} refunded or charged back`,
      tone: s.refunds.ratePct != null && s.refunds.ratePct >= 5 ? "warn" : "good",
    },
    {
      label: "Disputes",
      value: `${s.disputes.open} open`,
      sub: `${s.disputes.lost} lost · ${s.disputes.won} won`,
      tone: s.disputes.open > 0 || s.disputes.lost > 0 ? "warn" : "good",
    },
    { label: "Store credit", value: fmtUsd(s.storeCreditUsd), sub: "Referral + GV credit" },
  ];
  const valueTone = { gold: "text-gold-bright", good: "text-teal-300", warn: "text-orange-300" } as const;
  return (
    <div className={`grid gap-3 ${compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-6"}`}>
      {tiles.map((t) => (
        <div key={t.label} className={`rounded-xl border border-white/[0.08] ${compact ? "bg-[#18181d] p-3" : "bg-[#121216] p-4"}`}>
          <p className="text-xs text-zinc-400">{t.label}</p>
          <p className={`mt-0.5 font-mono font-semibold tracking-tight ${compact ? "text-lg" : "text-[22px]"} ${t.tone ? valueTone[t.tone] : "text-zinc-100"}`}>
            {t.value}
          </p>
          <p className="text-xs text-zinc-400">{t.sub}</p>
        </div>
      ))}
    </div>
  );
}

export function UserSafetyChecks({ summary }: { summary: AdminUserSummary }) {
  const s = summary;
  const rows: Array<{ k: string; v: string; bad: boolean }> = [
    { k: "Failed payments, last 24h", v: String(s.failedPayments24h), bad: s.failedPayments24h >= 3 },
    { k: "Possible linked accounts", v: s.linkedAccounts ? String(s.linkedAccounts) : "None", bad: s.linkedAccounts > 0 },
    { k: "Buying", v: s.user.purchasesLocked ? "Locked" : "Allowed", bad: s.user.purchasesLocked },
    { k: "Selling & payouts", v: s.user.sellerLocked ? "Locked" : "Allowed", bad: s.user.sellerLocked },
    { k: "Account", v: s.user.suspendedAt ? "Suspended" : "Active", bad: Boolean(s.user.suspendedAt) },
  ];
  return (
    <dl className="flex flex-col text-[13px]">
      {rows.map((r) => (
        <div key={r.k} className="flex justify-between gap-3 border-t border-white/[0.06] py-2 first:border-t-0">
          <dt className="text-zinc-300">{r.k}</dt>
          <dd className={`font-medium ${r.bad ? "text-red-300" : "text-teal-300"}`}>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function orderStatusPill(o: AdminUserSummary["recentOrders"][number]) {
  if (o.paymentStatus === "chargeback") return <Pill tone="bad">Charged back</Pill>;
  if (o.paymentStatus === "refunded") return <Pill tone="neutral">Refunded</Pill>;
  if (o.paymentStatus === "failed") return <Pill tone="bad">Payment failed</Pill>;
  if (o.paymentStatus !== "paid") return <Pill tone="neutral">{o.paymentStatus.replace(/_/g, " ")}</Pill>;
  if (o.fulfillmentStatus === "delivered") return <Pill tone="good">Delivered</Pill>;
  if (o.fulfillmentStatus === "shipped" || o.fulfillmentStatus === "in_transit") return <Pill tone="info">Shipped</Pill>;
  return <Pill tone="warn">Awaiting shipment</Pill>;
}

export function UserRecentOrders({ summary, limit = 6 }: { summary: AdminUserSummary; limit?: number }) {
  const rows = summary.recentOrders.slice(0, limit);
  if (rows.length === 0) return <p className="text-[13px] text-zinc-400">No orders yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-zinc-400">
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 font-medium">Item</th>
            <th className="py-2 pr-4 font-medium">Role</th>
            <th className="py-2 pr-4 font-medium">Other party</th>
            <th className="py-2 pr-4 text-right font-medium">Amount</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-t border-white/[0.06]">
              <td className="whitespace-nowrap py-2.5 pr-4 text-zinc-400">{fmtDate(o.createdAt)}</td>
              <td className="max-w-[280px] truncate py-2.5 pr-4 text-zinc-100">
                <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="hover:text-gold-bright">
                  {o.title}
                </Link>
              </td>
              <td className="py-2.5 pr-4 capitalize text-zinc-400">{o.role}</td>
              <td className="py-2.5 pr-4 text-zinc-300">{o.otherParty ? `@${o.otherParty}` : "—"}</td>
              <td className="py-2.5 pr-4 text-right font-mono text-zinc-100">{fmtUsd(o.totalUsd)}</td>
              <td className="py-2.5">{orderStatusPill(o)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
