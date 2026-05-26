"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import { safeReturnTo } from "@/lib/safe-return-to";
import { getSupabaseBrowserAuthClient } from "@/lib/supabase-browser-auth-client";
import { AUTH_USER_MESSAGES } from "@/lib/unified-auth";

function OAuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const [message, setMessage] = useState("Completing sign in…");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = getSupabaseBrowserAuthClient();
      if (!supabase) {
        if (!cancelled) setMessage("Sign-in is not configured on this site.");
        return;
      }

      const oauthError = searchParams.get("error_description") ?? searchParams.get("error");
      if (oauthError) {
        if (!cancelled) setMessage(decodeURIComponent(oauthError.replace(/\+/g, " ")));
        return;
      }

      const code = searchParams.get("code");
      let accessToken: string | null = null;

      try {
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          accessToken = data.session?.access_token ?? null;
        } else {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          accessToken = data.session?.access_token ?? null;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : AUTH_USER_MESSAGES.socialSignInFailed;
        if (!cancelled) setMessage(msg);
        return;
      }

      if (!accessToken) {
        if (!cancelled) setMessage(AUTH_USER_MESSAGES.socialSignInFailed);
        return;
      }

      const res = await signIn("supabase-oauth", {
        accessToken,
        redirect: false,
      });

      if (cancelled) return;

      if (!res?.ok || res.error) {
        setMessage(AUTH_USER_MESSAGES.socialSignInFailed);
        return;
      }

      router.replace(returnTo);
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [router, returnTo, searchParams]);

  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-zinc-400">{message}</p>
      {message !== "Completing sign in…" ? (
        <button
          type="button"
          className="mt-6 text-sm font-semibold text-gold-bright hover:underline"
          onClick={() => router.replace(`/signin?returnTo=${encodeURIComponent(returnTo)}`)}
        >
          Back to sign in
        </button>
      ) : null}
    </main>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[50vh] items-center justify-center px-6 text-sm text-zinc-500">
          Completing sign in…
        </main>
      }
    >
      <OAuthCallbackInner />
    </Suspense>
  );
}
