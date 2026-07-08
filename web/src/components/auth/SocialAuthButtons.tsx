"use client";

import { useEffect, useState } from "react";
import { AppleOAuthMark, GoogleOAuthMark } from "@/components/brand/OAuthProviderMark";
import { isAppleOAuthProviderEnabled, isGoogleOAuthProviderEnabled } from "@/lib/auth-provider-availability";

type Props = {
  returnTo: string;
  disabled?: boolean;
};

type SocialProvider = "google" | "apple";

type OauthProviders = { google: boolean; apple: boolean };

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
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-[#8E918F] bg-[#131314] text-sm font-medium text-[#E3E3E3] transition hover:border-[#A8AAA9] hover:bg-[#1A1A1B] disabled:opacity-60"
        >
          {busy === "google" ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-[#E3E3E3]/30 border-t-[#E3E3E3]" aria-hidden />
              Redirecting…
            </span>
          ) : (
            <>
              <GoogleOAuthMark />
              Continue with Google
            </>
          )}
        </button>
      ) : null}
      {appleEnabled ? (
        <button
          type="button"
          disabled={disabled || Boolean(busy)}
          onClick={() => onSocial("apple")}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-white/25 bg-black text-sm font-semibold text-white transition hover:border-white/35 hover:bg-[#0a0a0a] disabled:opacity-60"
        >
          {busy === "apple" ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
              Redirecting…
            </span>
          ) : (
            <>
              <AppleOAuthMark />
              Continue with Apple
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}
