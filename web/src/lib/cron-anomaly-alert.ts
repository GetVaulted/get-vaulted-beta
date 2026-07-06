import * as Sentry from "@sentry/nextjs";

/**
 * Report a cron/background job that completed "successfully" (HTTP 200, no thrown exception)
 * but did suspiciously less work than expected — e.g. `processed: 0` when candidates existed,
 * or partial per-item failures swallowed by an inner try/catch. Sentry only fires on thrown
 * exceptions by default, so without this a payout/layaway cron can silently stop doing useful
 * work for days before anyone notices (performance audit 2026-07).
 */
export function reportCronAnomaly(job: string, message: string): void {
  const detail = `[cron-anomaly] ${job}: ${message}`;
  if (process.env.SENTRY_DSN?.trim()) {
    Sentry.captureMessage(detail, "warning");
  } else {
    console.warn(detail);
  }
}

/**
 * Report an urgent payment-integrity anomaly that needs immediate manual attention — e.g. a buyer
 * was charged but a downstream step (like assigning a random-reveal label) failed and automatic
 * recovery (refund) either wasn't possible or itself failed. Fires at Sentry "error" severity
 * (vs. `reportCronAnomaly`'s "warning") because real money is unaccounted for.
 */
export function reportUrgentPaymentAnomaly(scope: string, message: string): void {
  const detail = `[payment-anomaly] ${scope}: ${message}`;
  if (process.env.SENTRY_DSN?.trim()) {
    Sentry.captureMessage(detail, "error");
  } else {
    console.error(detail);
  }
}
