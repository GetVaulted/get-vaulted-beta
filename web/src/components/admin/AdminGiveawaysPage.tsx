"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";

type CampaignRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  prizeLabel: string;
  prizeAmountUsd: number;
  startsAt: string;
  endsAt: string;
  totalEntries: number;
  totalEntrants: number;
};

export function AdminGiveawaysPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("$500 Get Vaulted Credit Giveaway");
  const [prizeAmountUsd, setPrizeAmountUsd] = useState("500");
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/giveaways", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load giveaways.");
        return;
      }
      const j = (await res.json()) as { campaigns?: CampaignRow[] };
      setCampaigns(Array.isArray(j.campaigns) ? j.campaigns : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/giveaways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          prizeAmountUsd: Number(prizeAmountUsd) || 500,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          description: "Drive new signups while rewarding our existing community.",
          rulesText:
            "Every verified Get Vaulted user gets 1 entry. New verified signups during the giveaway get 1 entry. Each verified referral earns 1 additional entry. One signup entry per user. Suspended, banned, deleted, admin, internal, and test accounts are not eligible.",
          prizeLabel: `$${Number(prizeAmountUsd) || 500} Get Vaulted Credit`,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; campaign?: { id: string } };
      if (!res.ok) {
        setError(j.error ?? "Create failed");
        return;
      }
      if (j.campaign?.id) {
        window.location.href = `/admin/giveaways/${j.campaign.id}`;
        return;
      }
      await load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminCommandShell
      title="Giveaways"
      subtitle="Platform credit campaigns — entries, draws, and prize awards."
    >
      <div className={`${adminPanelClassName} mb-6 space-y-3 p-4`}>
        <p className="text-sm font-semibold text-foreground">Create campaign</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Prize amount (USD)
            <input
              value={prizeAmountUsd}
              onChange={(e) => setPrizeAmountUsd(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Starts
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Ends
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={creating || !title.trim()}
          onClick={() => void create()}
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create draft"}
        </button>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-zinc-500">No campaigns yet.</p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/admin/giveaways/${c.id}`}
              className={`${adminPanelClassName} block p-4 hover:bg-white/[0.03]`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{c.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    /{c.slug} · {c.status} · {c.prizeLabel}
                  </p>
                </div>
                <p className="font-mono text-sm text-emerald-200">
                  {c.totalEntries} entries · {c.totalEntrants} entrants
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AdminCommandShell>
  );
}
