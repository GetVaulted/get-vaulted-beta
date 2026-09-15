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

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin-error]", error);
    if (!isStaleChunkError(error)) return;
    try {
      const key = "gv_admin_chunk_reload";
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    } catch {
      /* ignore */
    }
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[40vh] w-full max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-display text-xl font-bold text-foreground">Admin page error</h1>
      <p className="mt-3 text-sm text-zinc-400">
        This ops screen crashed. Try again, or open Moderation / Command Center from the nav.
      </p>
      {error.message ? (
        <p className="mt-3 max-w-md break-words rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11px] text-zinc-400">
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
          className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-5 text-xs font-semibold text-zinc-100 hover:border-gold/40"
        >
          Try again
        </button>
        <a
          href="/admin/listings?status=removed&channel=marketplace"
          className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-5 text-xs font-bold text-zinc-950"
        >
          Open listings
        </a>
        <a
          href="/admin"
          className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-5 text-xs font-semibold text-zinc-100"
        >
          Command Center
        </a>
      </div>
    </main>
  );
}
