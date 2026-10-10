"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import {
  SELLER_APPLICATION_LIMITS,
  SELLER_MONTHLY_VOLUME_OPTIONS,
  volumeLabel,
  type SellerApprovalState,
} from "@/lib/seller-application";

type ApplicationSnapshot = {
  enforced: boolean;
  status: SellerApprovalState;
  canSubmit: boolean;
  application: {
    whatTheySell: string;
    whereTheySellNow: string;
    experience: string;
    monthlyVolume: string;
    adminNote: string | null;
    submittedAt: string;
  } | null;
};

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-zinc-400";

export function SellerApplicationPage() {
  const { status: sessionStatus } = useSession();
  const [snap, setSnap] = useState<ApplicationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [whatTheySell, setWhatTheySell] = useState("");
  const [whereTheySellNow, setWhereTheySellNow] = useState("");
  const [experience, setExperience] = useState("");
  const [monthlyVolume, setMonthlyVolume] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/account/seller/application", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(j.error ?? "Could not load your application.");
        return;
      }
      const j = (await res.json()) as ApplicationSnapshot;
      setSnap(j);
      if (j.application) {
        setWhatTheySell(j.application.whatTheySell);
        setWhereTheySellNow(j.application.whereTheySellNow);
        setExperience(j.application.experience);
        setMonthlyVolume(j.application.monthlyVolume);
      }
    } catch {
      setLoadError("Could not load your application.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated") void load();
    else if (sessionStatus === "unauthenticated") setLoading(false);
  }, [sessionStatus, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/account/seller/application", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatTheySell, whereTheySellNow, experience, monthlyVolume }),
      });
      const j = (await res.json().catch(() => ({}))) as Partial<ApplicationSnapshot> & { error?: string };
      if (!res.ok) {
        setFormError(j.error ?? "Could not submit your application.");
        return;
      }
      setSnap(j as ApplicationSnapshot);
    } catch {
      setFormError("Could not submit your application. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sessionStatus === "unauthenticated") {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-black text-foreground">Apply to sell</h1>
        <p className="mt-3 text-sm text-zinc-400">Sign in to apply to sell on Get Vaulted.</p>
        <Link
          href="/signin?returnTo=%2Faccount%2Fseller%2Fapply"
          className="mt-6 inline-block rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-black hover:bg-gold-bright"
        >
          Sign in
        </Link>
      </main>
    );
  }

  const status = snap?.status ?? "not_applied";
  const L = SELLER_APPLICATION_LIMITS;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold/70">Get Vaulted Sellers</p>
      <h1 className="mt-1 font-display text-3xl font-black tracking-tight text-foreground">Apply to sell</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        We review every new seller before they can list items or go live, so buyers know who they&apos;re buying from.
        It takes a couple of minutes, and we&apos;ll notify you as soon as it&apos;s decided.
      </p>

      {loading ? (
        <p className="mt-10 text-sm text-zinc-500">Loading…</p>
      ) : loadError ? (
        <p className="mt-10 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200" role="alert">
          {loadError}
        </p>
      ) : status === "approved" ? (
        <section className="mt-10 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <h2 className="text-sm font-semibold text-emerald-200">You&apos;re approved to sell</h2>
          <p className="mt-1 text-sm text-emerald-100/80">Finish your seller setup to start listing and going live.</p>
          <Link
            href="/account/seller/setup"
            className="mt-4 inline-block rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-black hover:bg-gold-bright"
          >
            Continue to seller setup
          </Link>
        </section>
      ) : status === "pending" ? (
        <section className="mt-10 rounded-xl border border-gold/30 bg-gold/10 p-5">
          <h2 className="text-sm font-semibold text-gold-bright">Application under review</h2>
          <p className="mt-1 text-sm text-zinc-300">
            Submitted {snap?.application ? new Date(snap.application.submittedAt).toLocaleDateString("en-US", { dateStyle: "medium" }) : "recently"}.
            We&apos;ll send you a notification and an email when there&apos;s a decision.
          </p>
          <ApplicationSummary snap={snap} />
        </section>
      ) : status === "rejected" || status === "revoked" ? (
        <section className="mt-10 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5">
          <h2 className="text-sm font-semibold text-rose-200">
            {status === "rejected" ? "Application not approved" : "Seller access paused"}
          </h2>
          {snap?.application?.adminNote ? (
            <p className="mt-2 text-sm text-rose-100/90">{snap.application.adminNote}</p>
          ) : null}
          <p className="mt-2 text-sm text-zinc-400">
            Questions? Reach out through{" "}
            <Link href="/support/contact" className="text-gold-bright underline underline-offset-2">
              support
            </Link>
            .
          </p>
        </section>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-6">
          {status === "info_requested" ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4" role="status">
              <h2 className="text-sm font-semibold text-amber-200">We need a little more information</h2>
              {snap?.application?.adminNote ? (
                <p className="mt-1 text-sm text-amber-100/90">{snap.application.adminNote}</p>
              ) : null}
              <p className="mt-1 text-xs text-amber-100/70">Update your answers below and send it back.</p>
            </div>
          ) : null}

          <div>
            <label htmlFor="sa-sell" className={labelClass}>
              What do you sell?
            </label>
            <textarea
              id="sa-sell"
              className={fieldClass}
              rows={3}
              maxLength={L.whatTheySell.max}
              value={whatTheySell}
              onChange={(e) => setWhatTheySell(e.target.value)}
              placeholder="e.g. Sports cards, sealed wax, and graded singles — mostly football and basketball."
              required
            />
          </div>

          <div>
            <label htmlFor="sa-where" className={labelClass}>
              Where do you sell today?
            </label>
            <textarea
              id="sa-where"
              className={fieldClass}
              rows={2}
              maxLength={L.whereTheySellNow.max}
              value={whereTheySellNow}
              onChange={(e) => setWhereTheySellNow(e.target.value)}
              placeholder="e.g. eBay, Whatnot, card shows, Instagram — or “nowhere yet”. Links to your profiles help."
              required
            />
          </div>

          <div>
            <label htmlFor="sa-exp" className={labelClass}>
              Your selling experience
            </label>
            <textarea
              id="sa-exp"
              className={fieldClass}
              rows={3}
              maxLength={L.experience.max}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="How long have you been selling, and have you hosted live breaks or shows before?"
              required
            />
          </div>

          <div>
            <label htmlFor="sa-volume" className={labelClass}>
              Typical monthly sales
            </label>
            <select
              id="sa-volume"
              className={fieldClass}
              value={monthlyVolume}
              onChange={(e) => setMonthlyVolume(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose one…
              </option>
              {SELLER_MONTHLY_VOLUME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {formError ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-gold px-6 py-3 text-sm font-bold text-black transition hover:bg-gold-bright disabled:opacity-60"
          >
            {busy ? "Sending…" : status === "info_requested" ? "Send updated application" : "Submit application"}
          </button>
        </form>
      )}
    </main>
  );
}

function ApplicationSummary({ snap }: { snap: ApplicationSnapshot | null }) {
  const a = snap?.application;
  if (!a) return null;
  return (
    <dl className="mt-4 space-y-3 border-t border-white/10 pt-4 text-sm">
      <div>
        <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">What you sell</dt>
        <dd className="mt-0.5 text-zinc-200">{a.whatTheySell}</dd>
      </div>
      <div>
        <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Where you sell now</dt>
        <dd className="mt-0.5 text-zinc-200">{a.whereTheySellNow}</dd>
      </div>
      <div>
        <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Experience</dt>
        <dd className="mt-0.5 text-zinc-200">{a.experience}</dd>
      </div>
      <div>
        <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Monthly sales</dt>
        <dd className="mt-0.5 text-zinc-200">{volumeLabel(a.monthlyVolume)}</dd>
      </div>
    </dl>
  );
}
