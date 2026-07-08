"use client";

import { useEffect, useState } from "react";
import { isAppleOAuthProviderEnabled, isGoogleOAuthProviderEnabled } from "@/lib/auth-provider-availability";

type Props = {
  returnTo: string;
  disabled?: boolean;
};

type SocialProvider = "google" | "apple";

type OauthProviders = { google: boolean; apple: boolean };

function GoogleIcon() {
  return (
    // Official multicolor Google "G" (Google Identity / Firebase auth branding).
    <img src="/brand/google-g.svg" alt="" width={20} height={20} className="size-5 shrink-0" aria-hidden />
  );
}

function AppleIcon() {
  return (
    // Standard Apple logo mark (Sign in with Apple logo-only button style).
    <img src="/brand/apple-logo.svg" alt="" width={17} height={20} className="h-5 w-[17px] shrink-0" aria-hidden />
  );
}

/** Server route stores PKCE verifier in cookies before redirecting to Google/Apple. */
function oauthStartUrl(provider: SocialProvider, returnTo: string): string {
  const qs = new URLSearchParams({
    provider,
    returnTo,
  });
  return `/auth/start?${qs.toString()}`;
}

export function SocialAuthButtons({ returnTo, disabled }: Props) {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OauthProviders | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/config", { cache: "no-store" })
      .then((res) => res.json())
      .then((body: { oauthProviders?: OauthProviders }) => {
        if (cancelled || !body.oauthProviders) return;
        setOauthProviders(body.oauthProviders);
      })
      .catch(() => {
        /* fall back to build-time env flags below */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // If the user starts an OAuth redirect and then comes back without completing it (browser
  // back-button, cancel on the provider's screen, etc.), the page is restored — often from
  // bfcache — with `busy` still set, leaving the button stuck on "Redirecting…" forever. Clear it
  // whenever the page becomes visible/restored again. This never fires during a real, successful
  // redirect because the browser navigates away for good and this component/page is torn down.
  useEffect(() => {
    const clearBusy = () => setBusy(null);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) clearBusy();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") clearBusy();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", clearBusy);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", clearBusy);
    };
  }, []);

  const googleEnabled = oauthProviders?.google ?? isGoogleOAuthProviderEnabled();
  const appleEnabled = oauthProviders?.apple ?? isAppleOAuthProviderEnabled();

  if (!googleEnabled && !appleEnabled) return null;

  const onSocial = (provider: SocialProvider) => {
    if (disabled || busy) return;
    setBusy(provider);
    window.location.assign(oauthStartUrl(provider, returnTo));
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" aria-hidden />
        <span className="text-[11px] font-medium text-zinc-500">or continue with</span>
        <span className="h-px flex-1 bg-white/10" aria-hidden />
      </div>
      {googleEnabled ? (
        <button
          type="button"
          disabled={disabled || Boolean(busy)}
          onClick={() => onSocial("google")}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-white/12 bg-white/[0.04] text-sm font-semibold text-foreground transition hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-60"
        >
          <GoogleIcon />
          {busy === "google" ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-zinc-950/30 border-t-zinc-950" aria-hidden />
              Redirecting…
            </span>
          ) : (
            "Continue with Google"
          )}
        </button>
      ) : null}
      {appleEnabled ? (
        <button
          type="button"
          disabled={disabled || Boolean(busy)}
          onClick={() => onSocial("apple")}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-white/20 bg-black text-sm font-semibold text-white transition hover:border-white/30 hover:bg-zinc-950 disabled:opacity-60"
        >
          <AppleIcon />
          {busy === "apple" ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
              Redirecting…
            </span>
          ) : (
            "Continue with Apple"
          )}
        </button>
      ) : null}
    </div>
  );
}
