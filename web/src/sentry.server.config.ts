import * as Sentry from "@sentry/nextjs";

/**
 * Server-side (Node runtime) error monitoring. Complete no-op until SENTRY_DSN is set
 * (see web/docs/production-error-monitoring.md) — safe to ship without a Sentry account yet.
 */
const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.05,
    // Conservative by design: this is a payments marketplace (Stripe/Trustap tokens, NextAuth/
    // Supabase session cookies, shipping PII in request bodies). Do not auto-collect any of it —
    // errors should be diagnosable from stack trace + message alone.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      queryParams: false,
    },
    // The default Console integration attaches every console.log/error call as a breadcrumb on
    // whatever error fires next — an easy accidental-PII vector in app code we don't fully
    // control the logging of. Drop it; stack trace + message is enough to diagnose from.
    integrations: (defaults) => defaults.filter((i) => i.name !== "Console"),
  });
}
