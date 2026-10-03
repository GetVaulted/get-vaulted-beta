import * as Sentry from '@sentry/react-native';

/**
 * Live viewer lifecycle breadcrumbs (Stage/PiP/HLS playback transitions — join, leave, PiP
 * enter/exit, reconnects, teardown). Originally __DEV__-only console.log; that meant every one of
 * these 60+ call sites across the live-viewer code was silently a no-op in production, so when a
 * buyer reported audio bleeding between shows or getting booted out of a live room, there was
 * nothing in Sentry to show what actually happened leading up to it — not because Sentry was
 * broken, but because this specific trail was never being sent.
 *
 * Now always reports to Sentry's structured logger (enableLogs is on in Sentry.init), so these
 * events are queryable by roomId/event name independently of whether anything actually threw.
 * Kept deliberately as logs rather than captureMessage/addBreadcrumb — this fires far too often
 * (every player state tick, every PiP transition) to want each one creating or attaching to an
 * issue; logger entries are for searching after the fact, not for alerting on their own.
 */
const WARN_EVENT_PATTERN = /fail|error|unsupported|dismiss/i;

function sanitizeDetail(detail?: Record<string, unknown>): Record<string, string | number | boolean> | undefined {
  if (!detail) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (value != null) {
      out[key] = String(value);
    }
  }
  return out;
}

export function viewerLifecycleLog(event: string, detail?: Record<string, unknown>): void {
  if (__DEV__) {
    if (detail) {
      console.log(`[ViewerLifecycle] ${event}`, detail);
    } else {
      console.log(`[ViewerLifecycle] ${event}`);
    }
  }

  try {
    const attributes = { event, ...sanitizeDetail(detail) };
    if (WARN_EVENT_PATTERN.test(event)) {
      Sentry.logger.warn(`[ViewerLifecycle] ${event}`, attributes);
    } else {
      Sentry.logger.info(`[ViewerLifecycle] ${event}`, attributes);
    }
  } catch {
    /* logging must never break playback */
  }
}
