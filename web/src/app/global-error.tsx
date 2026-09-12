"use client";

import * as Sentry from "@sentry/nextjs";
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
 * Next.js App Router root error boundary — catches errors the root layout itself can't render
 * around. Reports to Sentry when configured (see web/docs/production-error-monitoring.md).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      if (process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
        Sentry.captureException(error);
      } else {
        console.error("[global-error]", error);
      }
    } catch {
      console.error("[global-error]", error);
    }

    if (!isStaleChunkError(error)) return;
    try {
      const key = "gv_global_chunk_reload";
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    } catch {
      /* ignore */
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#030303",
          color: "#f4f4f5",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#a1a1aa" }}>
            We hit an unexpected error. Try reloading the page — if it keeps happening, contact
            support.
          </p>
          {error.digest ? (
            <p style={{ marginTop: "0.5rem", fontSize: "0.7rem", color: "#52525b", fontFamily: "monospace" }}>
              Ref: {error.digest}
            </p>
          ) : null}
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                height: "2.75rem",
                padding: "0 1.25rem",
                borderRadius: "9999px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: "#f4f4f5",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.removeItem("gv_global_chunk_reload");
                } catch {
                  /* ignore */
                }
                window.location.href = "/";
              }}
              style={{
                height: "2.75rem",
                padding: "0 2rem",
                borderRadius: "9999px",
                border: "none",
                background: "linear-gradient(90deg, #c9a227, #e8d48b)",
                color: "#09090b",
                fontWeight: 700,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Back to home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
