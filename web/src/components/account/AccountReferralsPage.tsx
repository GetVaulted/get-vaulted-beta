"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { buildReferralJoinUrl } from "../../../../shared/referral-link";

type WalletReferralFields = {
  referralCode: string;
  referralCreditUsd: number;
  referralCreditPendingUsd: number;
  referralSuccessfulReferrals: number;
};

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function AccountReferralsPage() {
  const router = useRouter();
  const { status } = useSession();
  const [wallet, setWallet] = useState<WalletReferralFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/signin?returnTo=/account/referrals");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/account/wallet", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { wallet?: WalletReferralFields };
        if (cancelled) return;
        if (!res.ok || !data.wallet) {
          setError("Could not load your referral info. Try again.");
          return;
        }
        setWallet(data.wallet);
      } catch {
        if (!cancelled) setError("Could not load your referral info. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://shopgetvaulted.com";
  const referralUrl = wallet?.referralCode ? buildReferralJoinUrl(wallet.referralCode, origin) : "";

  const copyLink = useCallback(async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy link — copy it manually instead.");
    }
  }, [referralUrl]);

  const shareLink = useCallback(async () => {
    if (!referralUrl || !wallet?.referralCode) return;
    const code = wallet.referralCode.trim().toUpperCase();
    const shareData = {
      title: "Get Vaulted",
      text: `Use my Get Vaulted code ${code} — we both get $10 after your first order.`,
      url: referralUrl,
    };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
      } else {
        await copyLink();
      }
    } catch {
      /* user dismissed the native share sheet */
    }
  }, [referralUrl, copyLink, wallet?.referralCode]);

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="relative mx-auto w-full max-w-2xl px-4 pb-16 pt-5 sm:px-6">
        <Link href="/account" className="text-xs font-semibold text-zinc-500 hover:text-zinc-300">
          ← My Account
        </Link>

        <header className="mt-3 border-b border-white/[0.07] pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Referral program</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Refer friends, earn credit
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Share your link. When a friend signs up and completes their first order of $25 or more, you both get
            $10 in credit.
          </p>
        </header>

        {loading ? (
          <p className="mt-8 text-sm text-zinc-500">Loading…</p>
        ) : error ? (
          <p className="mt-8 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        ) : wallet ? (
          <>
            <section className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">Available credit</p>
                <p className="mt-1 text-2xl font-black text-emerald-400">{formatUsd(wallet.referralCreditUsd)}</p>
                <p className="mt-1 text-xs text-zinc-500">Choose to apply it at checkout on eligible purchases.</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">Pending credit</p>
                <p className="mt-1 text-2xl font-black text-zinc-200">{formatUsd(wallet.referralCreditPendingUsd)}</p>
                <p className="mt-1 text-xs text-zinc-500">Clears once the qualifying order&apos;s return window closes.</p>
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-gold/25 bg-gold/[0.06] p-5">
              <p className="text-sm font-semibold text-gold-bright">Your referral link</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Anyone who signs up with this link is credited to you for life — no expiration.
              </p>
              {referralUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-gold/30 bg-[#0c0c10] px-4 py-3 text-left text-sm font-semibold text-gold-bright transition hover:border-gold/50"
                  >
                    <span className="truncate">{referralUrl.replace(/^https?:\/\//, "")}</span>
                    <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-zinc-500">
                      {copied ? "Copied" : "Copy"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void shareLink()}
                    className="mt-3 h-11 w-full rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 transition hover:brightness-110"
                  >
                    Share your link
                  </button>
                </>
              ) : null}
              <p className="mt-4 text-xs text-zinc-500">
                {wallet.referralSuccessfulReferrals > 0
                  ? `${wallet.referralSuccessfulReferrals} friend${wallet.referralSuccessfulReferrals === 1 ? "" : "s"} referred so far.`
                  : "No referrals yet — share your link to get started."}
              </p>
            </section>

            <section className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-950/40 p-5 text-xs leading-relaxed text-zinc-500">
              <p className="font-semibold text-zinc-400">How it works</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Share your link with a friend who hasn&apos;t used Get Vaulted before.</li>
                <li>They sign up and complete a paid order of $25 or more.</li>
                <li>You both get $10 in credit once that order&apos;s return window closes.</li>
                <li>At checkout, choose whether to apply your credit to eligible Buy Now, offer, or auction payments.</li>
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
