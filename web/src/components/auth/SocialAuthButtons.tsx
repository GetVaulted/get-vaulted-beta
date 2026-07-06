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
    <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
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
