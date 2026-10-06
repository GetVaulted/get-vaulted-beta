"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type TermsStatus = { required?: boolean; version?: string };

/**
 * Blocks the seller console until the seller accepts the updated live-content terms (Terms §7.1).
 * The go-live API routes enforce the same rule server-side; this just explains it up front.
 * Fails open: if the status check errors, the server still blocks going live with a clear message.
 */
export function SellerLiveTermsGate() {
  const router = useRouter();
  const [required, setRequired] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/account/seller/live-terms", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json().catch(() => null)) as TermsStatus | null;
        if (!cancelled && j?.required === true) setRequired(true);
      } catch {
        /* server-side gate still applies */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const accept = useCallback(async () => {
    if (!agreed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/seller/live-terms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error?.trim() || "Could not save your acceptance. Try again.");
        return;
      }
      setRequired(false);
    } catch {
      setError("Could not save your acceptance. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [agreed, saving]);

  if (!required) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="seller-live-terms-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-gold/25 bg-zinc-950 p-5 shadow-2xl">
        <h2 id="seller-live-terms-title" className="font-display text-lg font-bold text-foreground">
          Updated seller terms
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          Before you go live, please review and accept our updated terms. They explain that you are responsible for
          everything shown or heard in your live shows, including your camera, background, music, guests, and the
          claims you make about items.
        </p>
        <a
          href="/terms#live-content"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-medium text-gold-bright hover:underline"
        >
          Read Terms Section 7.1
        </a>
        <label htmlFor="seller-live-terms-agree" className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-zinc-200">
          <input
            id="seller-live-terms-agree"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--gold)]"
          />
          <span>I have read and agree to the updated seller terms, including responsibility for my live content.</span>
        </label>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-rose-300">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={() => void accept()}
            disabled={!agreed || saving}
            className="rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-black transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Agree and continue"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/5"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
