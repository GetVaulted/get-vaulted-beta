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

/**
 * High-frequency events (player ticks, every stream poll). In production these were ~500k Sentry
 * log calls per day — each one runs sanitize + a native bridge hop on the JS thread while a buyer
 * is watching. Keep the trail searchable but cap each (event, room) pair to one entry per window.
 * Errors, joins/leaves, PiP and teardown events are NOT in this set and always send.
 */
const NOISY_EVENT_MIN_INTERVAL_MS = 20_000;
const NOISY_EVENTS = new Set([
  'player_state_changed',
  'player_playing_change',
  'playback_url_received',
  'viewer_playback_plan',
  'source_loaded',
  'play_called',
  'stage_participants_changed',
  'screen_blurred',
  'screen_focused',
  'pip_retry_no_view',
]);
const noisyLastSentAt = new Map<string, number>();

function shouldSendToSentry(event: string, detail?: Record<string, unknown>): boolean {
  if (!NOISY_EVENTS.has(event)) return true;
  const room = detail && (detail.roomId ?? detail.showId);
  const key = `${event}:${typeof room === 'string' ? room : ''}`;
  const now = Date.now();
  const last = noisyLastSentAt.get(key);
  if (last != null && now - last < NOISY_EVENT_MIN_INTERVAL_MS) return false;
  noisyLastSentAt.set(key, now);
  if (noisyLastSentAt.size > 500) {
    for (const [k, t] of noisyLastSentAt) {
      if (now - t > NOISY_EVENT_MIN_INTERVAL_MS) noisyLastSentAt.delete(k);
    }
  }
  return true;
}

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

  if (!shouldSendToSentry(event, detail)) return;

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
