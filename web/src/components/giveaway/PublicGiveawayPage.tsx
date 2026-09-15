"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { buildReferralJoinUrl } from "../../../../shared/referral-link";

type CampaignPayload = {
  id: string;
  slug: string;
  title: string;
  description: string;
  rulesText: string;
  prizeLabel: string;
  prizeAmountUsd: number;
  status: string;
  startsAt: string;
  endsAt: string;
  isLive: boolean;
  totalEntries: number;
  totalEntrants: number;
  winnerConfirmedAt: string | null;
  prizeAwardedAt: string | null;
  winnerUsername: string | null;
};

type MyEntries = {
  totalEntries: number;
  referralEntries: number;
  purchaseEntries: number;
  history: Array<{
    id: string;
    entryType: string;
    quantity: number;
    source: string;
    createdAt: string;
  }>;
  referralCode: string | null;
};

function formatUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function entryTypeLabel(t: string, quantity: number) {
  switch (t) {
    case "existing_user":
      return "Early member entry";
    case "new_signup":
      return "New signup entry";
    case "referral":
      return "Referral entry";
    case "purchase":
      return quantity < 0 ? "Purchase entries removed (refund)" : "Purchase bonus";
    case "manual_adjustment":
      return "Adjustment";
    default:
      return t;
  }
}

function useCountdown(endsAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(() => {
    if (!endsAt) return null;
    const ms = Math.max(0, Date.parse(endsAt) - now);
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return { days, hours, minutes, seconds, expired: ms <= 0 };
  }, [endsAt, now]);
}

export function PublicGiveawayPage({ slug }: { slug?: string }) {
  const { status: sessionStatus } = useSession();
  const [campaign, setCampaign] = useState<CampaignPayload | null>(null);
  const [myEntries, setMyEntries] = useState<MyEntries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let targetSlug = slug?.trim();
      if (!targetSlug) {
        const listRes = await fetch("/api/giveaways", { cache: "no-store" });
        const listJ = (await listRes.json()) as {
          active?: { slug?: string } | null;
          campaigns?: Array<{ slug: string; isLive?: boolean }>;
        };
        targetSlug =
          listJ.active?.slug ??
          listJ.campaigns?.find((c) => c.isLive)?.slug ??
          listJ.campaigns?.[0]?.slug;
        if (!targetSlug) {
          setError("No giveaway is available right now.");
          setCampaign(null);
          return;
        }
      }

      const res = await fetch(`/api/giveaways/${encodeURIComponent(targetSlug)}`, {
        cache: "no-store",
      });
      const j = (await res.json()) as {
        campaign?: CampaignPayload;
        myEntries?: MyEntries | null;
        error?: string;
      };
      if (!res.ok || !j.campaign) {
        setError(j.error ?? "Giveaway not found.");
        setCampaign(null);
        return;
      }
      setCampaign(j.campaign);
      setMyEntries(j.myEntries ?? null);
    } catch {
      setError("Could not load giveaway.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load, sessionStatus]);

  const countdown = useCountdown(campaign?.isLive ? campaign.endsAt : null);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://shopgetvaulted.com";
  const referralUrl =
    myEntries?.referralCode != null && myEntries.referralCode.trim()
      ? buildReferralJoinUrl(myEntries.referralCode, origin)
      : "";

  const copyReferral = useCallback(async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [referralUrl]);

  if (loading) {
    return (
      <main className="flex min-h-[70vh] flex-1 items-center justify-center bg-[#030303] px-4 text-sm text-zinc-500">
        Loading giveaway…
      </main>
    );
  }

  if (error || !campaign) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center bg-[#030303] px-4 text-center">
        <p className="text-sm text-zinc-400">{error ?? "Giveaway not found."}</p>
        <Link href="/marketplace" className="mt-6 text-sm font-semibold text-amber-400 hover:underline">
          Browse marketplace
        </Link>
      </main>
    );
  }

  const prize =
    campaign.prizeLabel?.trim() ||
    `${formatUsd(campaign.prizeAmountUsd)} Get Vaulted Credit`;

  return (
    <main className="relative min-h-screen flex-1 overflow-hidden bg-[#030303] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(212,175,55,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(24,24,27,0.9),_#030303)]"
      />
      <div className="relative mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-500/90">
          Official platform giveaway
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-black tracking-tight text-white sm:text-5xl">
          {campaign.title}
        </h1>
        <p className="mt-4 text-lg font-semibold text-amber-300">{prize}</p>
        {campaign.description ? (
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">{campaign.description}</p>
        ) : null}

        {campaign.isLive && countdown && !countdown.expired ? (
          <div className="mt-8 grid grid-cols-4 gap-2 sm:gap-3">
            {[
              ["Days", countdown.days],
              ["Hours", countdown.hours],
              ["Min", countdown.minutes],
              ["Sec", countdown.seconds],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center"
              >
                <p className="text-2xl font-black tabular-nums text-white sm:text-3xl">{value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {label}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">
            {campaign.winnerConfirmedAt
              ? `Winner confirmed${campaign.winnerUsername ? `: @${campaign.winnerUsername}` : ""}.`
              : campaign.status === "ended"
                ? "This giveaway has ended."
                : campaign.status === "scheduled"
                  ? `Opens ${new Date(campaign.startsAt).toLocaleString()}.`
                  : campaign.status === "paused"
                    ? "Temporarily paused."
                    : null}
          </p>
        )}

        <p className="mt-6 text-xs text-zinc-500">
          {campaign.totalEntrants.toLocaleString()} entrants · {campaign.totalEntries.toLocaleString()}{" "}
          total entries
        </p>

        <section className="mt-10 border-t border-white/10 pt-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Your entries</h2>
          {sessionStatus === "unauthenticated" ? (
            <p className="mt-3 text-sm text-zinc-400">
              <Link
                href={`/signin?returnTo=${encodeURIComponent(`/giveaway/${campaign.slug}`)}`}
                className="font-semibold text-amber-400 hover:underline"
              >
                Sign in
              </Link>{" "}
              to see your entries. Verify your email to enter. Existing members are entered when the
              campaign activates.
            </p>
          ) : myEntries == null ? (
            <p className="mt-3 text-sm text-zinc-500">Loading your entries…</p>
          ) : myEntries.totalEntries <= 0 ? (
            <p className="mt-3 text-sm text-zinc-400">
              You don&apos;t have an entry yet. Verify your email while this giveaway is live, or wait
              for activation if you&apos;re an existing member.
            </p>
          ) : (
            <>
              <p className="mt-3 text-2xl font-black text-white">
                {myEntries.totalEntries}{" "}
                <span className="text-base font-semibold text-zinc-400">
                  {myEntries.totalEntries === 1 ? "entry" : "entries"}
                </span>
              </p>
              {myEntries.history.some((h) => h.entryType === "existing_user") ? (
                <p className="mt-2 text-sm text-zinc-400">
                  Thanks for being an early Get Vaulted member — you were automatically entered.
                </p>
              ) : null}
              <ul className="mt-4 space-y-2">
                {myEntries.history.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-3 text-sm text-zinc-300"
                  >
                    <span>
                      {entryTypeLabel(h.entryType, h.quantity)}
                      {h.quantity !== 1 ? ` ×${h.quantity}` : ""}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-600">
                      {new Date(h.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="mt-10 border-t border-white/10 pt-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">
            Earn more entries
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Share your referral link. When someone you refer creates an account and verifies their
            email during the giveaway, you get another entry. Paid purchases also earn bonus entries:
            every full $10 spent (item price) adds 1 entry. (This is separate from the $10/$10
            purchase referral program.)
          </p>
          {sessionStatus === "authenticated" && referralUrl ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={referralUrl}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-300"
              />
              <button
                type="button"
                onClick={() => void copyReferral()}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          ) : sessionStatus === "authenticated" ? (
            <p className="mt-3 text-sm text-zinc-500">
              Your referral link will appear here once your account is fully set up.
            </p>
          ) : (
            <Link
              href={`/signup?returnTo=${encodeURIComponent(`/giveaway/${campaign.slug}`)}`}
              className="mt-4 inline-flex rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400"
            >
              Sign up to enter
            </Link>
          )}
          {myEntries && myEntries.referralEntries > 0 ? (
            <p className="mt-3 text-xs text-zinc-500">
              Referral entries so far: {myEntries.referralEntries}
            </p>
          ) : null}
          {myEntries && myEntries.purchaseEntries > 0 ? (
            <p className="mt-1 text-xs text-zinc-500">
              Purchase bonus entries: {myEntries.purchaseEntries}
            </p>
          ) : null}
        </section>

        {campaign.rulesText?.trim() ? (
          <section className="mt-10 border-t border-white/10 pt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Rules</h2>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">
              {campaign.rulesText}
            </div>
          </section>
        ) : null}

        <p className="mt-12 text-center text-[11px] text-zinc-600">
          Get Vaulted Credit is store credit only — not withdrawable for cash. Void where prohibited.
        </p>
      </div>
    </main>
  );
}
