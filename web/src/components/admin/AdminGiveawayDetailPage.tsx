"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminCommandShell, adminPanelClassName, formatAdminUsd } from "@/components/admin/AdminCommandShell";
import { AdminCsvExportButton } from "@/components/admin/AdminCsvExportButton";

type Campaign = {
  id: string;
  slug: string;
  title: string;
  description: string;
  rulesText: string;
  status: string;
  prizeLabel: string;
  prizeAmountUsd: number;
  startsAt: string;
  endsAt: string;
  totalEntries: number;
  totalEntrants: number;
  avgEntriesPerUser: number;
  purchaseEntries: number;
  purchaseRevenue: number;
  fraudCount: number;
  breakdown: {
    existing_user: number;
    new_signup: number;
    referral: number;
    purchase: number;
    manual_adjustment: number;
  };
  topEntrants: Array<{
    userId: string;
    username: string | null;
    email: string | null;
    totalEntries: number;
  }>;
  winnerUserId: string | null;
  winnerConfirmedAt: string | null;
  prizeAwardedAt: string | null;
  winnerUser?: { id: string; username: string | null; email: string } | null;
  draws?: Array<{
    id: string;
    status: string;
    isRedraw: boolean;
    redrawReason: string | null;
    totalEntries: number;
    totalEntrants: number;
    createdAt: string;
    winnerUser: { username: string | null; email: string };
    adminUser: { username: string | null };
  }>;
};

type Entrant = {
  userId: string;
  username: string | null;
  email: string | null;
  totalEntries: number;
};

export function AdminGiveawayDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redrawReason, setRedrawReason] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editRules, setEditRules] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/admin/giveaways/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) {
      setError("Could not load campaign.");
      return;
    }
    const j = (await res.json()) as { campaign: Campaign };
    setCampaign(j.campaign);
    setEditTitle(j.campaign.title);
    setEditRules(j.campaign.rulesText);
  }, [id]);

  const loadEntrants = useCallback(async () => {
    if (!id) return;
    const res = await fetch(
      `/api/admin/giveaways/${encodeURIComponent(id)}/entrants?q=${encodeURIComponent(q)}&limit=100`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const j = (await res.json()) as { entrants: Entrant[] };
    setEntrants(j.entrants ?? []);
  }, [id, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadEntrants();
  }, [loadEntrants]);

  const patchStatus = async (status: string) => {
    setBusy(status);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/giveaways/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        backfill?: { scanned: number; created: number };
      };
      if (!res.ok) {
        setError(j.error ?? "Update failed");
        return;
      }
      if (j.backfill) {
        setNote(`Backfill: scanned ${j.backfill.scanned}, created ${j.backfill.created} entries.`);
      }
      await load();
      await loadEntrants();
    } finally {
      setBusy(null);
    }
  };

  const saveEdit = async () => {
    setBusy("save");
    try {
      const res = await fetch(`/api/admin/giveaways/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, rulesText: editRules }),
      });
      if (!res.ok) {
        setError("Save failed");
        return;
      }
      await load();
      setNote("Saved.");
    } finally {
      setBusy(null);
    }
  };

  const action = async (actionName: string, body: Record<string, unknown> = {}) => {
    setBusy(actionName);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/giveaways/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName, ...body }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Action failed");
        return;
      }
      setNote(`${actionName} ok`);
      await load();
      await loadEntrants();
    } finally {
      setBusy(null);
    }
  };

  if (!campaign) {
    return (
      <AdminCommandShell title="Giveaway">
        <p className="text-sm text-zinc-500">{error ?? "Loading…"}</p>
      </AdminCommandShell>
    );
  }

  const pendingDraw = campaign.draws?.find((d) => d.status === "pending_confirm");

  return (
    <AdminCommandShell
      title={campaign.title}
      subtitle={`/${campaign.slug} · ${campaign.status}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <AdminCsvExportButton report="giveaway-entrants" params={{ campaignId: id }} />
          <Link href="/admin/giveaways" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300">
            All giveaways
          </Link>
        </div>
      }
    >
      {note ? (
        <p className="mb-4 rounded-lg border border-sky-400/25 bg-sky-950/30 px-3 py-2 text-sm text-sky-100">{note}</p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">{error}</p>
      ) : null}

      <div className={`${adminPanelClassName} mb-6 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <p className="text-[10px] font-bold uppercase text-zinc-500">Entries</p>
          <p className="font-display text-2xl font-black">{campaign.totalEntries}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-zinc-500">Entrants</p>
          <p className="font-display text-2xl font-black">{campaign.totalEntrants}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-zinc-500">Avg entries / user</p>
          <p className="font-display text-2xl font-black">{campaign.avgEntriesPerUser ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-zinc-500">Fraud flags</p>
          <p className="font-display text-2xl font-black">{campaign.fraudCount}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-zinc-500">Purchase entries</p>
          <p className="font-display text-2xl font-black">{campaign.purchaseEntries ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-zinc-500">Purchase revenue</p>
          <p className="font-display text-2xl font-black">
            {formatAdminUsd(campaign.purchaseRevenue ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-zinc-500">Prize</p>
          <p className="font-display text-2xl font-black">{formatAdminUsd(campaign.prizeAmountUsd)}</p>
        </div>
      </div>

      {campaign.breakdown ? (
        <div className={`${adminPanelClassName} mb-6 p-4`}>
          <p className="mb-3 text-sm font-semibold">Entry breakdown</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                ["Signup", (campaign.breakdown.new_signup ?? 0) + (campaign.breakdown.existing_user ?? 0)],
                ["Referral", campaign.breakdown.referral ?? 0],
                ["Purchase", campaign.breakdown.purchase ?? 0],
                ["Manual", campaign.breakdown.manual_adjustment ?? 0],
                ["Existing member", campaign.breakdown.existing_user ?? 0],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] font-bold uppercase text-zinc-500">{label}</p>
                <p className="font-display text-xl font-black tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {campaign.topEntrants && campaign.topEntrants.length > 0 ? (
        <div className={`${adminPanelClassName} mb-6 p-4`}>
          <p className="mb-3 text-sm font-semibold">Top entrants</p>
          <ul className="divide-y divide-white/5">
            {campaign.topEntrants.map((e, i) => (
              <li key={e.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-zinc-400">
                  #{i + 1}{" "}
                  <span className="font-semibold text-zinc-100">
                    {e.username ? `@${e.username}` : e.email ?? e.userId.slice(0, 8)}
                  </span>
                </span>
                <span className="font-mono text-emerald-200">{e.totalEntries}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={`${adminPanelClassName} mb-6 space-y-3 p-4`}>
        <p className="text-sm font-semibold">Status</p>
        <div className="flex flex-wrap gap-2">
          {(["active", "paused", "ended", "cancelled", "draft"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy !== null || campaign.status === s}
              onClick={() => void patchStatus(s)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 disabled:opacity-40"
            >
              {busy === s ? "…" : s}
            </button>
          ))}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void action("backfill")}
            className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-[11px] font-semibold text-amber-100"
          >
            Re-run backfill
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Activating runs an automatic backfill of 1 entry to every eligible existing verified user.
        </p>
      </div>

      <div className={`${adminPanelClassName} mb-6 space-y-3 p-4`}>
        <p className="text-sm font-semibold">Edit</p>
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
        <textarea
          value={editRules}
          onChange={(e) => setEditRules(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void saveEdit()}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-200"
        >
          Save
        </button>
      </div>

      <div className={`${adminPanelClassName} mb-6 space-y-3 p-4`}>
        <p className="text-sm font-semibold">Draw winner</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void action("draw")}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200"
          >
            Draw (weighted)
          </button>
          <input
            value={redrawReason}
            onChange={(e) => setRedrawReason(e.target.value)}
            placeholder="Redraw reason (required)"
            className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={busy !== null || !redrawReason.trim()}
            onClick={() => void action("redraw", { redrawReason })}
            className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-100"
          >
            Redraw
          </button>
        </div>
        {pendingDraw ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3 text-sm">
            <p>
              Pending confirm: @{pendingDraw.winnerUser.username} ({pendingDraw.winnerUser.email}) —{" "}
              {pendingDraw.totalEntries} tickets / {pendingDraw.totalEntrants} entrants
            </p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void action("confirm_winner", { drawId: pendingDraw.id })}
              className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100"
            >
              Confirm & award credit
            </button>
          </div>
        ) : null}
        {campaign.prizeAwardedAt ? (
          <p className="text-xs text-emerald-200">
            Prize awarded {new Date(campaign.prizeAwardedAt).toLocaleString()} to @
            {campaign.winnerUser?.username}
          </p>
        ) : null}
        <ul className="divide-y divide-white/[0.06] text-xs text-zinc-400">
          {(campaign.draws ?? []).map((d) => (
            <li key={d.id} className="py-2">
              {new Date(d.createdAt).toLocaleString()} · {d.status}
              {d.isRedraw ? ` · redraw (${d.redrawReason})` : ""} · @{d.winnerUser.username} · by @
              {d.adminUser.username}
            </li>
          ))}
        </ul>
      </div>

      <div className={`${adminPanelClassName} p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Entrants</p>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search username / email"
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs"
          />
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {entrants.map((e) => (
            <li key={e.userId} className="flex items-center justify-between gap-2 py-2 text-sm">
              <Link href={`/admin/users/${e.userId}`} className="text-gold-bright hover:underline">
                @{e.username ?? e.userId.slice(0, 8)}
              </Link>
              <span className="text-xs text-zinc-500">{e.email}</span>
              <span className="font-mono text-emerald-200">{e.totalEntries}</span>
            </li>
          ))}
        </ul>
      </div>
    </AdminCommandShell>
  );
}
