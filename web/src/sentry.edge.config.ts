import * as Sentry from "@sentry/nextjs";

/**
 * Edge runtime (middleware, edge routes) error monitoring. Complete no-op until SENTRY_DSN is
 * set (see web/docs/production-error-monitoring.md) — safe to ship without a Sentry account yet.
 */
const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.05,
  });
}
