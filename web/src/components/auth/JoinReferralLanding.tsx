"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppDownloadBadges } from "@/components/marketing/AppDownloadBadges";
import { appStoreUrlForPlatform, hasAnyAppStoreLink } from "@/lib/app-store-links";
import { isMobileWebUserAgent, mobileWebPlatform } from "@/lib/mobile-browser-detect";
import { joinReferralCustomSchemeUrl } from "@/lib/universal-app-links";

type JoinReferralLandingProps = {
  referralCode: string;
  returnTo: string;
};

/**
 * Referral entry for shared `/join?ref=…` links.
 * - App already installed (Universal Link): OS opens the native signup screen and this page is skipped.
 * - Mobile browser: try open app, then send to App Store / Play Store; show the invite code so they
 *   can enter it after install (stores do not pass query params through).
 * - Desktop: continue on web signup with `ref` preserved.
 */
export function JoinReferralLanding({ referralCode, returnTo }: JoinReferralLandingProps) {
  const code = referralCode.trim().toUpperCase().slice(0, 32);
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const signupHref = useMemo(() => {
    const params = new URLSearchParams();
    if (returnTo && returnTo !== "/marketplace") params.set("returnTo", returnTo);
    if (code) params.set("ref", code);
    const qs = params.toString();
    return `/signup${qs ? `?${qs}` : ""}`;
  }, [code, returnTo]);

  const storeUrl = useMemo(() => appStoreUrlForPlatform(platform) ?? "/app", [platform]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const mobile = isMobileWebUserAgent(ua);
    setIsMobile(mobile);
    setPlatform(mobileWebPlatform(ua));

    if (!mobile || !code) return;

    // Soft open if the app is installed (custom scheme). Universal Links usually claim `/join`
    // before this runs; this covers older installs / browsers that fell through to the web page.
    const schemeUrl = joinReferralCustomSchemeUrl(code);
    const alreadyTried = sessionStorage.getItem(`gv-join-open-app:${code}`) === "1";
    if (alreadyTried) return;
    sessionStorage.setItem(`gv-join-open-app:${code}`, "1");

    const openTimer = window.setTimeout(() => {
      try {
        window.location.href = schemeUrl;
      } catch {
        /* ignore */
      }
    }, 250);

    // If still on this page, send them to the store to download.
    const storeTimer = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      if (!hasAnyAppStoreLink()) return;
      window.location.assign(storeUrl);
    }, 1400);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(storeTimer);
    };
  }, [code, storeUrl]);

  const copyCode = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [code]);

  const goToStore = useCallback(() => {
    window.location.assign(storeUrl);
  }, [storeUrl]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center px-6 py-16 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-bright">You&apos;re invited</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
        Download Get Vaulted
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        {code
          ? "Install the app, then enter this invite code when you sign up. You and your friend each get $10 after your first order of $25 or more."
          : "Install the Get Vaulted app to buy, sell, trade, and join live shows."}
      </p>

      {code ? (
        <div className="mt-8 rounded-2xl border border-gold/25 bg-zinc-950/80 px-4 py-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Your invite code</p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-[0.18em] text-gold-bright">{code}</p>
          <button
            type="button"
            onClick={() => void copyCode()}
            className="mt-3 text-xs font-semibold text-zinc-300 underline-offset-2 hover:underline"
          >
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col items-center gap-4">
        {isMobile ? (
          <button
            type="button"
            onClick={goToStore}
            className="inline-flex w-full max-w-xs items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 py-3 text-sm font-bold uppercase tracking-wide text-zinc-950"
          >
            {platform === "android" ? "Get it on Google Play" : "Download on the App Store"}
          </button>
        ) : null}
        <AppDownloadBadges size="large" />
      </div>

      <p className="mt-8 text-xs text-zinc-500">
        Prefer the website?{" "}
        <Link href={signupHref} className="font-semibold text-gold-bright underline-offset-2 hover:underline">
          Continue on web
        </Link>
      </p>
    </main>
  );
}
