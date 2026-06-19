"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { safeReturnTo } from "@/lib/safe-return-to";
import { AUTH_USER_MESSAGES } from "@/lib/unified-auth";

function OAuthBridgeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const [message, setMessage] = useState("Completing sign in…");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const res = await fetch("/api/auth/complete-oauth", {
        method: "POST",
        credentials: "include",
      });

      if (cancelled) return;

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || body?.error) {
        setMessage(body?.error ?? AUTH_USER_MESSAGES.socialSignInFailed);
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
