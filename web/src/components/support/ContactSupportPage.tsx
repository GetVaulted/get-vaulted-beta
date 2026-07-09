"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import type { SupportTicketCategory } from "@/generated/prisma/enums";
import {
  SUPPORT_CONTACT_CATEGORIES,
  SUPPORT_EMAIL,
  SUPPORT_TICKETS_PATH,
  isSupportTicketCategory,
} from "@/lib/support-contact";
import type { SupportTicketDto } from "@/lib/support-tickets";

function parseInitialCategory(raw: string | null): SupportTicketCategory {
  return isSupportTicketCategory(raw) ? raw : "other";
}

export function ContactSupportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const initialCategory = useMemo(
    () => parseInitialCategory(searchParams.get("category")),
    [searchParams],
  );
  const initialReferenceId = searchParams.get("referenceId")?.trim() ?? "";
  const initialReferenceType = searchParams.get("referenceType")?.trim() ?? "";

  const [category, setCategory] = useState<SupportTicketCategory>(initialCategory);
  const [reference, setReference] = useState(initialReferenceId);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!message.trim()) {
      setError("Describe your issue so we can help.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject:
            subject.trim() ||
            SUPPORT_CONTACT_CATEGORIES.find((c) => c.id === category)?.label ||
            "Support request",
          message: message.trim(),
          contactEmail: session?.user?.email ?? "",
          referenceType: initialReferenceType || undefined,
          referenceId: reference.trim() || initialReferenceId || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; ticket?: SupportTicketDto };
      if (!res.ok) {
        setError(j.error ?? "Could not submit your ticket. Try again.");
        return;
      }
      if (j.ticket?.id) {
        router.push(`/support/tickets/${encodeURIComponent(j.ticket.id)}?submitted=1`);
        return;
      }
      router.push(SUPPORT_TICKETS_PATH);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="py-24 text-center text-sm text-zinc-500">Loading…</div>
    );
  }

  if (status === "unauthenticated") {
    const returnTo = `/support/contact${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    return (
      <div className="rounded-2xl border border-gold/25 bg-gold/5 p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold text-foreground">Sign in to contact support</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">
          Submit a support ticket from your account so we can look up orders and reply faster. You can also email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-gold-bright hover:underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          directly.
        </p>
        <Link
          href={`/signin?returnTo=${encodeURIComponent(returnTo)}`}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black transition hover:bg-gold-bright"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-400">
          We typically respond within 1–2 business days. Include order, trade, or show IDs when relevant.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Prefer email? Write to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-gold-bright/90 hover:text-gold-bright">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Category</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUPPORT_CONTACT_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                category === c.id
                  ? "border-gold/40 bg-gold/10 text-gold-bright"
                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Reference (optional)</span>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Order, trade, or listing ID"
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-100"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Subject</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short summary"
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-100"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="What happened? Include dates, usernames, and screenshots if you have them."
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-100"
        />
      </label>

      {error ? <p className="text-sm font-medium text-rose-300">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-6 py-3 text-sm font-bold text-black transition hover:bg-gold-bright disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Submit ticket"}
        </button>
        <Link href={SUPPORT_TICKETS_PATH} className="text-sm font-semibold text-zinc-400 hover:text-gold-bright">
          View my tickets
        </Link>
      </div>
    </div>
  );
}
