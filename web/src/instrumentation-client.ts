import * as Sentry from "@sentry/nextjs";

/**
 * Client-side error monitoring. Complete no-op until NEXT_PUBLIC_SENTRY_DSN is set (see
 * web/docs/production-error-monitoring.md) — safe to ship without a Sentry account yet.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
    // Keep sampling low by default — this is for "did something break", not full APM.
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.05,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
