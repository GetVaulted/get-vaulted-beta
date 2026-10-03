"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminPanelClassName,
  adminSelectClassName,
  adminTableClassName,
} from "@/components/admin/AdminCommandShell";
import type {
  AdminReferralCreditRow,
  AdminReferralCreditSummary,
  AdminReferralWalletRow,
} from "@/lib/admin/admin-referral-credits";

type StatusFilter = "all" | AdminReferralCreditRow["status"];

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function statusTone(status: AdminReferralCreditRow["status"]): "ok" | "warn" | "bad" | "neutral" {
  switch (status) {
    case "available":
      return "ok";
    case "pending":
    case "reserved":
      return "warn";
    case "voided":
      return "bad";
    default:
      return "neutral";
  }
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function AdminReferralsPage() {
  const [summary, setSummary] = useState<AdminReferralCreditSummary | null>(null);
  const [credits, setCredits] = useState<AdminReferralCreditRow[]>([]);
  const [wallets, setWallets] = useState<AdminReferralWalletRow[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/referral-credits?${params.toString()}`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        summary?: AdminReferralCreditSummary;
        credits?: AdminReferralCreditRow[];
        wallets?: AdminReferralWalletRow[];
      };
      if (!res.ok) {
        setError(j.error ?? "Could not load referral credits.");
        return;
      }
      setSummary(j.summary ?? null);
      setCredits(Array.isArray(j.credits) ? j.credits : []);
      setWallets(Array.isArray(j.wallets) ? j.wallets : []);
    } catch {
      setError("Could not load referral credits.");
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusCards = useMemo(() => summary?.byStatus ?? [], [summary]);

  return (
    <AdminCommandShell
      title="Referral credits"
      subtitle="$10 / $10 on a referred friend's first paid order of $25+. Pending holds ~14 days. Credit is platform-funded marketing spend."
      actions={
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/[0.04]"
        >
          Refresh
        </button>
      }
    >
      {error ? (
        <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`${adminPanelClassName} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Outstanding</p>
          <p className="mt-1 text-2xl font-black text-gold-bright">{money(summary?.totalOutstandingUsd ?? 0)}</p>
          <p className="mt-1 text-xs text-zinc-500">Pending + available + reserved</p>
        </div>
        <div className={`${adminPanelClassName} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Spent</p>
          <p className="mt-1 text-2xl font-black text-emerald-300">{money(summary?.totalSpentUsd ?? 0)}</p>
          <p className="mt-1 text-xs text-zinc-500">Applied at checkout</p>
        </div>
        <div className={`${adminPanelClassName} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Voided</p>
          <p className="mt-1 text-2xl font-black text-rose-300">{money(summary?.totalVoidedUsd ?? 0)}</p>
          <p className="mt-1 text-xs text-zinc-500">Refund / self-referral blocks</p>
        </div>
        <div className={`${adminPanelClassName} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Attributed users</p>
          <p className="mt-1 text-2xl font-black text-foreground">{summary?.attributedUsers ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">Accounts with a referrer</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {statusCards.map((s) => (
          <button
            key={s.status}
            type="button"
            onClick={() => setStatus(s.status)}
            className={`${adminPanelClassName} p-3 text-left transition hover:border-gold/30 ${
              status === s.status ? "ring-1 ring-gold/40" : ""
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{s.status}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {money(s.amountUsd)} · {s.count}
            </p>
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Status
          <select
            className={adminSelectClassName}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="spent">Spent</option>
            <option value="voided">Voided</option>
          </select>
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Search
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQ(qDraft.trim());
            }}
            placeholder="Username, email, code, order id…"
            className="rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-xs text-zinc-200"
          />
        </label>
        <button
          type="button"
          onClick={() => setQ(qDraft.trim())}
          className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold-bright hover:bg-gold/25"
        >
          Search
        </button>
        {status !== "all" || q ? (
          <button
            type="button"
            onClick={() => {
              setStatus("all");
              setQ("");
              setQDraft("");
            }}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Clear
          </button>
        ) : null}
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">Credit ledger</h2>
        <p className="mt-1 text-xs text-zinc-500">Newest first. Each qualifying order creates referrer + referee rows.</p>
        <div className={`${adminPanelClassName} mt-3 overflow-x-auto`}>
          {loading ? (
            <p className="p-4 text-sm text-zinc-500">Loading…</p>
          ) : credits.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">No referral credit rows match.</p>
          ) : (
            <table className={adminTableClassName}>
              <thead className="border-b border-white/[0.06] text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th>Created</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Available</th>
                  <th>Source order</th>
                  <th>Spent / void</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {credits.map((c) => (
                  <tr key={c.id} className="border-b border-white/[0.04]">
                    <td className="whitespace-nowrap text-zinc-500">
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <Link
                        href={`/admin/users/${encodeURIComponent(c.user.id)}`}
                        className="font-semibold text-gold-bright hover:underline"
                      >
                        @{c.user.username}
                      </Link>
                      <div className="text-[10px] text-zinc-500">{c.user.email}</div>
                    </td>
                    <td className="capitalize">{c.role}</td>
                    <td>
                      <AdminStatusPill tone={statusTone(c.status)}>{c.status}</AdminStatusPill>
                    </td>
                    <td>{money(c.amountUsd)}</td>
                    <td className="whitespace-nowrap text-zinc-500">
                      {new Date(c.availableAt).toLocaleDateString()}
                    </td>
                    <td>
                      <Link
                        href={`/admin/orders/${encodeURIComponent(c.sourceOrder.id)}`}
                        className="text-sky-300 hover:underline"
                      >
                        {shortId(c.sourceOrder.id)}
                      </Link>
                      <div className="text-[10px] text-zinc-500">
                        @{c.sourceOrder.buyer.username} · {money(c.sourceOrder.totalUsd)} ·{" "}
                        {c.sourceOrder.paymentStatus}
                      </div>
                    </td>
                    <td className="text-[11px] text-zinc-500">
                      {c.spentOrderId ? (
                        <Link
                          href={`/admin/orders/${encodeURIComponent(c.spentOrderId)}`}
                          className="text-emerald-300 hover:underline"
                        >
                          spent {shortId(c.spentOrderId)}
                        </Link>
                      ) : null}
                      {c.voidReason ? <div className="text-rose-300/90">{c.voidReason}</div> : null}
                      {!c.spentOrderId && !c.voidReason ? "—" : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-foreground">Wallets</h2>
        <p className="mt-1 text-xs text-zinc-500">Users with referral activity, sorted by outstanding balance.</p>
        <div className={`${adminPanelClassName} mt-3 overflow-x-auto`}>
          {loading ? (
            <p className="p-4 text-sm text-zinc-500">Loading…</p>
          ) : wallets.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">No referral wallets yet.</p>
          ) : (
            <table className={adminTableClassName}>
              <thead className="border-b border-white/[0.06] text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th>User</th>
                  <th>Code</th>
                  <th>Available</th>
                  <th>Pending</th>
                  <th>Reserved</th>
                  <th>Spent</th>
                  <th>Voided</th>
                  <th>Wins</th>
                  <th>Referred by</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {wallets.map((w) => (
                  <tr key={w.userId} className="border-b border-white/[0.04]">
                    <td>
                      <Link
                        href={`/admin/users/${encodeURIComponent(w.userId)}`}
                        className="font-semibold text-gold-bright hover:underline"
                      >
                        @{w.username}
                      </Link>
                      <div className="text-[10px] text-zinc-500">{w.email}</div>
                    </td>
                    <td className="font-mono text-[11px] text-zinc-400">{w.referralCode ?? "—"}</td>
                    <td>{money(w.availableUsd)}</td>
                    <td>{money(w.pendingUsd)}</td>
                    <td>{money(w.reservedUsd)}</td>
                    <td>{money(w.spentUsd)}</td>
                    <td>{money(w.voidedUsd)}</td>
                    <td>{w.successfulReferrals}</td>
                    <td className="text-zinc-500">{w.referredByUsername ? `@${w.referredByUsername}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </AdminCommandShell>
  );
}
