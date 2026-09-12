"use client";

import { useEffect } from "react";

function isStaleChunkError(error: Error): boolean {
  const msg = `${error.name} ${error.message}`;
  return (
    error.name === "ChunkLoadError" ||
    /loading chunk \d+ failed/i.test(msg) ||
    /failed to fetch dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg)
  );
}

/**
 * Route-level error boundary (keeps root layout / nav). Prefer this over global-error for
 * page crashes so the whole site chrome isn't wiped.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
    if (!isStaleChunkError(error)) return;
    try {
      const key = "gv_chunk_reload";
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    } catch {
      /* ignore */
    }
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-display text-2xl font-bold text-foreground">Something went wrong</h1>
      <p className="mt-3 text-sm text-zinc-400">
        This page hit an unexpected error. Try again — if it keeps happening after a hard refresh,
        contact support.
      </p>
      {error.message ? (
        <p className="mt-3 max-w-md break-words rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left font-mono text-[11px] text-zinc-400">
          {error.message}
        </p>
      ) : null}
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-zinc-600">Ref: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-100 transition hover:border-gold/40 hover:text-gold-bright"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.removeItem("gv_chunk_reload");
            } catch {
              /* ignore */
            }
            window.location.href = "/";
          }}
          className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 transition hover:brightness-110"
        >
          Back to home
        </button>
      </div>
    </main>
  );
}
