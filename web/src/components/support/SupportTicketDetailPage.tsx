"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { SUPPORT_TICKETS_PATH } from "@/lib/support-contact";
import type { SupportTicketDto } from "@/lib/support-tickets";

export function SupportTicketDetailPage({ ticketId }: { ticketId: string }) {
  const searchParams = useSearchParams();
  const justSubmitted = searchParams.get("submitted") === "1";
  const { status } = useSession();
  const [ticket, setTicket] = useState<SupportTicketDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as { ticket?: SupportTicketDto; error?: string };
      if (!res.ok) {
        setError(j.error ?? "Ticket not found.");
        setTicket(null);
        return;
      }
      setTicket(j.ticket ?? null);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  if (status === "loading" || loading) {
    return <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-6 text-center">
        <p className="text-sm text-zinc-300">Sign in to view this ticket.</p>
        <Link
          href={`/signin?returnTo=${encodeURIComponent(`/support/tickets/${ticketId}`)}`}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-950/10 p-6">
        <p className="text-sm text-rose-200">{error ?? "Ticket not found."}</p>
        <Link href={SUPPORT_TICKETS_PATH} className="mt-4 inline-block text-sm font-semibold text-gold-bright hover:underline">
          ← My tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {justSubmitted ? (
        <p className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 px-4 py-3 text-sm text-emerald-200">
          Ticket submitted. Reference <span className="font-mono font-semibold">{ticket.id}</span>. We will reply by
          email at {ticket.contactEmail}.
        </p>
      ) : null}

      <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{ticket.categoryLabel}</p>
            <h2 className="font-display mt-1 text-xl font-bold text-foreground">{ticket.subject}</h2>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-300">
            {ticket.statusLabel}
          </span>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Ticket ID</dt>
            <dd className="mt-1 font-mono text-zinc-200">{ticket.id}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Submitted</dt>
            <dd className="mt-1 text-zinc-200">{new Date(ticket.createdAt).toLocaleString()}</dd>
          </div>
          {ticket.referenceId ? (
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Reference</dt>
              <dd className="mt-1 font-mono text-zinc-200">{ticket.referenceId}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-6 border-t border-white/[0.08] pt-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Your message</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{ticket.message}</p>
        </div>
      </div>

      <Link href={SUPPORT_TICKETS_PATH} className="inline-block text-sm font-semibold text-gold-bright hover:underline">
        ← All tickets
      </Link>
    </div>
  );
}
