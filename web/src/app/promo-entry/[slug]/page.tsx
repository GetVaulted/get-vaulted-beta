"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type PromoPayload = {
  promo: {
    id: string;
    title: string;
    prizeDescription: string;
    rulesText: string;
    status: string;
    roomTitle: string;
    sellerUsername: string;
    entriesOpen: boolean;
  };
};

export default function PromoEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { data: session, status: sessionStatus } = useSession();
  const [slug, setSlug] = useState("");
  const [promo, setPromo] = useState<PromoPayload["promo"] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mailingAddress, setMailingAddress] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void params.then((p) => setSlug(decodeURIComponent(p.slug)));
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    void (async () => {
      setLoadError(null);
      try {
        const res = await fetch(`/api/promo-entry/${encodeURIComponent(slug)}`, { cache: "no-store" });
        const j = (await res.json()) as PromoPayload & { error?: string };
        if (!res.ok) {
          setLoadError(j.error ?? "Promotion not found.");
          return;
        }
        setPromo(j.promo);
      } catch {
        setLoadError("Could not load promotion.");
      }
    })();
  }, [slug]);

  const handleSubmit = useCallback(async () => {
    if (!slug) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/promo-entry/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, mailingAddress }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSubmitError(j.error ?? "Could not submit entry.");
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError("Could not submit entry.");
    } finally {
      setSubmitting(false);
    }
  }, [email, fullName, mailingAddress, slug]);

  if (!slug) return null;

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-zinc-950 px-4 py-10 text-zinc-100">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Official promotion rules</p>
      {loadError ? <p className="mt-6 text-sm text-rose-300">{loadError}</p> : null}
      {promo ? (
        <div className="mt-4 space-y-4">
          <h1 className="text-xl font-bold">{promo.title}</h1>
          <p className="text-sm text-zinc-400">
            Hosted by @{promo.sellerUsername} · {promo.roomTitle}
          </p>
          {promo.prizeDescription ? <p className="text-sm text-zinc-300">{promo.prizeDescription}</p> : null}
          <div className="rounded-xl border border-zinc-800 bg-black/40 p-4 text-xs leading-relaxed text-zinc-400 whitespace-pre-wrap">
            {promo.rulesText}
          </div>
          {sessionStatus === "loading" ? (
            <p className="text-sm text-zinc-500">Loading account…</p>
          ) : !session?.user ? (
            <p className="text-sm text-zinc-500">Sign in to submit a no-purchase entry.</p>
          ) : submitted ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              Entry received. Good luck.
            </p>
          ) : promo.entriesOpen ? (
            <div className="space-y-3 rounded-xl border border-zinc-800 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">No-purchase entry (AMOE)</p>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full legal name"
                className="w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm"
              />
              <textarea
                value={mailingAddress}
                onChange={(e) => setMailingAddress(e.target.value)}
                placeholder="Mailing address"
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm"
              />
              {submitError ? <p className="text-xs text-rose-300">{submitError}</p> : null}
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmit()}
                className="w-full rounded-lg bg-zinc-100 py-2.5 text-sm font-bold text-zinc-900 disabled:opacity-50"
              >
                Submit no-purchase entry
              </button>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">This promotion is not accepting entries right now.</p>
          )}
        </div>
      ) : null}
    </main>
  );
}
