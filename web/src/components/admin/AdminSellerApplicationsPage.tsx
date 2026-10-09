"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminButtonDangerClassName,
  adminButtonPrimaryClassName,
  adminPanelClassName,
  adminSelectClassName,
} from "@/components/admin/AdminCommandShell";
import { volumeLabel, type SellerApplicationAction } from "@/lib/seller-application";

type AppRow = {
  id: string;
  status: "pending" | "info_requested" | "approved" | "rejected" | "revoked";
  whatTheySell: string;
  whereTheySellNow: string;
  experience: string;
  monthlyVolume: string;
  adminNote: string | null;
  grandfathered: boolean;
  submittedAt: string;
  reviewedAt: string | null;
  user: {
    id: string;
    username: string;
    email: string;
    name: string | null;
    joinedAt: string;
    suspended: boolean;
    stripeReady: boolean;
    listingCount: number;
    liveShowCount: number;
  };
};

type ListResponse = { enforced: boolean; counts: Record<string, number>; applications: AppRow[] };

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "info_requested", label: "Waiting on seller" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "revoked", label: "Revoked" },
  { value: "all", label: "All" },
];

const NOTE_PROMPT: Partial<Record<SellerApplicationAction, string>> = {
  reject: "Reason shown to the applicant",
  request_info: "What do you need from them?",
  revoke: "Reason shown to the seller",
};

function tone(status: AppRow["status"]): "ok" | "warn" | "bad" | "neutral" {
  if (status === "approved") return "ok";
  if (status === "pending" || status === "info_requested") return "warn";
  return "bad";
}

export function AdminSellerApplicationsPage() {
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [grandfatheredOnly, setGrandfatheredOnly] = useState(false);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<{ id: string; action: SellerApplicationAction } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ status });
      if (q.trim()) sp.set("q", q.trim());
      if (grandfatheredOnly) sp.set("grandfathered", "1");
      const res = await fetch(`/api/admin/seller-applications?${sp}`, { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load applications.");
        return;
      }
      setData((await res.json()) as ListResponse);
    } finally {
      setLoading(false);
    }
  }, [status, q, grandfatheredOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: string, action: SellerApplicationAction, withNote: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/seller-applications/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: withNote }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        stillLive?: { activeListings: number; upcomingShows: number };
      };
      if (!res.ok) {
        setError(j.error ?? "That didn't work.");
        return;
      }
      setActing(null);
      setNote("");
      setMessage(
        j.stillLive
          ? `Seller access revoked. They still have ${j.stillLive.activeListings} active listing(s) and ${j.stillLive.upcomingShows} scheduled/live show(s) — remove those separately if needed.`
          : "Done — the applicant was notified.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const counts = data?.counts ?? {};

  return (
    <AdminCommandShell
      title="Seller Applications"
      subtitle="New sellers apply here. Approve, reject, or ask for more information — or revoke someone who already sells."
    >
      {data && !data.enforced ? (
        <p className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Enforcement is OFF — applications are collected but nobody is blocked yet. Review the grandfathered list, revoke
          anyone who shouldn&apos;t sell, then set <code className="font-mono">SELLER_APPLICATIONS_ENFORCED=1</code> in
          Netlify to turn it on.
        </p>
      ) : null}
      {message ? (
        <p className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-zinc-500">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={adminSelectClassName}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
                {f.value !== "all" && counts[f.value] != null ? ` (${counts[f.value]})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-zinc-500">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="username or email"
            className={adminSelectClassName}
          />
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={grandfatheredOnly} onChange={(e) => setGrandfatheredOnly(e.target.checked)} />
          Grandfathered only
        </label>
      </div>

      <div className="mt-6 space-y-3">
        {loading && !data ? <p className="text-sm text-zinc-500">Loading…</p> : null}
        {data && data.applications.length === 0 ? (
          <p className={`${adminPanelClassName} p-6 text-sm text-zinc-500`}>Nothing here.</p>
        ) : null}
        {data?.applications.map((a) => (
          <article key={a.id} className={`${adminPanelClassName} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/users/${a.user.id}`}
                    className="text-sm font-semibold text-foreground hover:text-gold-bright"
                  >
                    @{a.user.username}
                  </Link>
                  <AdminStatusPill tone={tone(a.status)}>{a.status.replace("_", " ")}</AdminStatusPill>
                  {a.grandfathered ? <AdminStatusPill tone="neutral">grandfathered</AdminStatusPill> : null}
                  {a.user.suspended ? <AdminStatusPill tone="bad">suspended</AdminStatusPill> : null}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {a.user.email} · joined {new Date(a.user.joinedAt).toLocaleDateString("en-US")} ·{" "}
                  {a.user.listingCount} listing(s) · {a.user.liveShowCount} show(s) ·{" "}
                  {a.user.stripeReady ? "payouts set up" : "no payouts yet"}
                </p>
              </div>
              <p className="text-xs text-zinc-500">
                {a.grandfathered ? "Auto-approved" : `Applied ${new Date(a.submittedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`}
              </p>
            </div>

            {!a.grandfathered ? (
              <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                <Answer label="Sells" value={a.whatTheySell} />
                <Answer label="Sells now on" value={a.whereTheySellNow} />
                <Answer label="Experience" value={a.experience} />
                <Answer label="Monthly volume" value={volumeLabel(a.monthlyVolume)} />
              </dl>
            ) : null}

            {a.adminNote && !a.grandfathered ? (
              <p className="mt-3 rounded-lg bg-white/[0.04] p-2.5 text-xs text-zinc-300">
                <span className="font-semibold text-zinc-400">Message sent: </span>
                {a.adminNote}
              </p>
            ) : null}

            {acting?.id === a.id ? (
              <div className="mt-3 space-y-2">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder={NOTE_PROMPT[acting.action] ?? "Optional note"}
                  className="w-full rounded-lg border border-white/10 bg-[#050506] p-2 text-xs text-zinc-200"
                  aria-label="Message to the seller"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || (acting.action !== "approve" && !note.trim())}
                    onClick={() => void decide(a.id, acting.action, note)}
                    className={acting.action === "approve" ? adminButtonPrimaryClassName : adminButtonDangerClassName}
                  >
                    {busy ? "Saving…" : `Confirm ${acting.action.replace("_", " ")}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActing(null);
                      setNote("");
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {a.status !== "approved" ? (
                  <button
                    type="button"
                    className={adminButtonPrimaryClassName}
                    onClick={() => {
                      setMessage(null);
                      setActing({ id: a.id, action: "approve" });
                    }}
                  >
                    {a.status === "pending" || a.status === "info_requested" ? "Approve" : "Reinstate"}
                  </button>
                ) : null}
                {a.status === "pending" ? (
                  <button
                    type="button"
                    className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
                    onClick={() => {
                      setMessage(null);
                      setActing({ id: a.id, action: "request_info" });
                    }}
                  >
                    Ask for more info
                  </button>
                ) : null}
                {a.status === "pending" || a.status === "info_requested" ? (
                  <button
                    type="button"
                    className={adminButtonDangerClassName}
                    onClick={() => {
                      setMessage(null);
                      setActing({ id: a.id, action: "reject" });
                    }}
                  >
                    Reject
                  </button>
                ) : null}
                {a.status === "approved" ? (
                  <button
                    type="button"
                    className={adminButtonDangerClassName}
                    onClick={() => {
                      setMessage(null);
                      setActing({ id: a.id, action: "revoke" });
                    }}
                  >
                    Revoke access
                  </button>
                ) : null}
              </div>
            )}
          </article>
        ))}
      </div>
    </AdminCommandShell>
  );
}

function Answer({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-zinc-200">{value || "—"}</dd>
    </div>
  );
}
