"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import { safeReturnTo } from "@/lib/safe-return-to";
import { getSupabaseBrowserAuthClient } from "@/lib/supabase-browser-auth-client";
import { AUTH_USER_MESSAGES } from "@/lib/unified-auth";

function OAuthBridgeInner() {
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

      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error) {
        setMessage(error.message || AUTH_USER_MESSAGES.socialSignInFailed);
        return;
      }

      const accessToken = data.session?.access_token ?? null;
      if (!accessToken) {
        setMessage(AUTH_USER_MESSAGES.socialSignInFailed);
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
  }, [router, returnTo]);

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

export default function OAuthBridgePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[50vh] items-center justify-center px-6 text-sm text-zinc-500">
          Completing sign in…
        </main>
      }
    >
      <OAuthBridgeInner />
    </Suspense>
  );
}
