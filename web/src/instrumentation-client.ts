import * as Sentry from "@sentry/nextjs";

/**
 * Client-side error monitoring. Complete no-op until NEXT_PUBLIC_SENTRY_DSN is set (see
 * web/docs/production-error-monitoring.md) — safe to ship without a Sentry account yet.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

/** Meta/Android in-app WebView bridge teardown — not first-party code. */
function isAndroidInAppBrowserBridgeNoise(event: Sentry.ErrorEvent): boolean {
  const frames =
    event.exception?.values?.flatMap((v) => v.stacktrace?.frames ?? []) ?? [];
  if (
    frames.some((f) =>
      /navigation_performance_logger_android/i.test(f.filename ?? f.abs_path ?? ""),
    )
  ) {
    return true;
  }
  const message = event.exception?.values?.[0]?.value ?? event.message ?? "";
  return /Java object is gone/i.test(message);
}

/**
 * hls.js prebundle uses `?.`; ancient browsers throw SyntaxError while evaluating the chunk.
 * We gate the dynamic import client-side; keep this filter for cached tabs / race loads.
 */
function isLegacyHlsJsParseNoise(event: Sentry.ErrorEvent): boolean {
  const ex = event.exception?.values?.[0];
  if (!ex || ex.type !== "SyntaxError") return false;
  if (!/Unexpected token ['"]\.['"]/i.test(ex.value ?? "")) return false;
  const frames = ex.stacktrace?.frames ?? [];
  return frames.some((f) =>
    /\/_next\/static\/chunks\//i.test(f.filename ?? f.abs_path ?? ""),
  );
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
    // Keep sampling low by default — this is for "did something break", not full APM.
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.05,
    // Conservative by design: this is a payments marketplace (addresses, order totals, card
    // last4 shown on screen; Stripe/Trustap tokens and auth cookies on outgoing requests).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      queryParams: false, // Supabase email links carry access/recovery tokens in query/hash.
    },
    ignoreErrors: [
      // Android System WebView / Facebook·Instagram in-app browser native bridge race.
      "Error invoking postMessage: Java object is gone",
      /Java object is gone/i,
    ],
    beforeSend(event) {
      if (isAndroidInAppBrowserBridgeNoise(event)) return null;
      if (isLegacyHlsJsParseNoise(event)) return null;
      return event;
    },
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    integrations: [
      // Explicit (not relying on defaults): mask all text/inputs, block all media in replays.
      Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
      // Overrides the default Breadcrumbs integration (same name → replaces it) to stop
      // capturing console.* calls as breadcrumbs — see sentry.server.config.ts for why.
      Sentry.breadcrumbsIntegration({ console: false }),
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
