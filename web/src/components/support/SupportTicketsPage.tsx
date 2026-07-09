"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { buildSupportContactHref } from "@/lib/support-contact";
import type { SupportTicketDto } from "@/lib/support-tickets";

export function SupportTicketsPage() {
  const { status } = useSession();
  const [rows, setRows] = useState<SupportTicketDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support/tickets", { cache: "no-store", credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as { tickets?: SupportTicketDto[]; error?: string };
      if (!res.ok) {
        setError(j.error ?? "Could not load tickets.");
        setRows([]);
        return;
      }
      setRows(Array.isArray(j.tickets) ? j.tickets : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  if (status === "loading") {
    return <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-6 text-center">
        <p className="text-sm text-zinc-300">Sign in to view your support tickets.</p>
        <Link
          href={`/signin?returnTo=${encodeURIComponent("/support/tickets")}`}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">Track requests you submitted from Get Vaulted.</p>
        <Link
          href={buildSupportContactHref()}
          className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-4 text-xs font-bold uppercase tracking-wide text-gold-bright hover:border-gold/40 hover:bg-gold/10"
        >
          New ticket
        </Link>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Loading tickets…</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-200">No support tickets yet</p>
          <Link
            href={buildSupportContactHref()}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black"
          >
            Contact support
          </Link>
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/support/tickets/${encodeURIComponent(t.id)}`}
                className="block rounded-xl border border-white/[0.08] bg-[#08080a]/90 px-4 py-3 transition hover:border-gold/25"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-100">{t.subject}</p>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                    {t.statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {t.categoryLabel} · {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
