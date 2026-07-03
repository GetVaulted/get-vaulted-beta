"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Next.js App Router root error boundary — catches errors the root layout itself can't render
 * around. Reports to Sentry when configured (see web/docs/production-error-monitoring.md).
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
      Sentry.captureException(error);
    } else {
      console.error("[global-error]", error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#030303] px-6 text-center text-foreground">
        <div className="max-w-md">
          <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
          <p className="mt-3 text-sm text-zinc-400">
            We hit an unexpected error. Try reloading the page — if it keeps happening, contact
            support.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 transition hover:brightness-110"
          >
            Back to home
          </a>
        </div>
      </body>
    </html>
  );
}
