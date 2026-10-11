import { Platform } from 'react-native';

type DiagData = Record<string, string | number | boolean | null | undefined>;

const lastSentAt = new Map<string, number>();
const MIN_GAP_MS = 60_000;

/**
 * Records WHY a login was lost (corrupt saved login, forced recovery, unexpected sign-out) so it
 * shows up in Sentry. Before this existed, every sign-out path swallowed its reason silently.
 * Never throws, never contains tokens or emails, and sends each kind at most once a minute.
 */
export function reportAuthDiagnostic(kind: string, data: DiagData = {}): void {
  try {
    const now = Date.now();
    const prev = lastSentAt.get(kind) ?? 0;
    if (now - prev < MIN_GAP_MS) return;
    lastSentAt.set(kind, now);
    void import('@sentry/react-native')
      .then((Sentry) => {
        Sentry.addBreadcrumb({ category: 'auth', message: kind, level: 'warning', data });
        Sentry.captureMessage(`auth:${kind}`, {
          level: 'warning',
          tags: { auth_event: kind, platform: Platform.OS },
          extra: data,
        });
      })
      .catch(() => {});
  } catch {
    /* diagnostics must never affect sign-in */
  }
}
