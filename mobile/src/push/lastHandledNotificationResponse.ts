import AsyncStorage from '@react-native-async-storage/async-storage';

/** @deprecated Pre-2026-07 device-wide key — kept only for the one-time per-user migration in
 * `getLastHandledNotificationResponseId` below. Never write to this directly. */
const STORAGE_KEY = 'gv_last_handled_notification_response_v1';

/**
 * Per-user key so one account's "already handled this notification tap" marker never leaks into
 * a different account signed into the same device without a force-quit (matches the per-user
 * AsyncStorage scoping pattern used elsewhere for the 2026-07 account-switch-leak fixes — see
 * `sellerWizardStorage.ts`). A device-global key would otherwise let User B's cold-start deep
 * link tap be silently swallowed as "already handled" if User A had recently tapped a
 * notification with the same identifier on the same device.
 */
export function lastHandledNotificationResponseKey(userId: string): string {
  return `${STORAGE_KEY}:${userId}`;
}

/**
 * Expo persists `getLastNotificationResponseAsync()` until a NEW notification is tapped, but
 * `NotificationDeepLinkEffect` re-checks it on every mount (every login, every app resume where
 * the effect remounts). Without tracking which response we already acted on, a days-old tap
 * would silently re-fire and re-navigate on every subsequent login/resume. Pure so it's cheap to
 * unit test without touching AsyncStorage.
 */
export function shouldHandleNotificationResponse(
  candidateId: string | null | undefined,
  lastHandledId: string | null | undefined,
): boolean {
  if (!candidateId) return false;
  return candidateId !== lastHandledId;
}

/**
 * Reads the per-user marker. If it was never set for this user but the legacy device-wide marker
 * is set, adopt it as this user's starting point — WITHOUT deleting the legacy key. Unlike a
 * sensitive completion flag, an over-shared notification-dedup id has low blast radius (worst
 * case: one already-consumed tap is treated as already-handled for a second user too), so this
 * intentionally skips the bounded multi-user migration cap `sellerWizardStorage.ts` uses for
 * higher-stakes flags — but keeps that same "never delete the legacy value" principle so a real
 * second user on a shared device isn't permanently locked out of it just because a different user
 * happened to read it first.
 */
export async function getLastHandledNotificationResponseId(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const scoped = await AsyncStorage.getItem(lastHandledNotificationResponseKey(userId));
    if (scoped != null) return scoped;
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setLastHandledNotificationResponseId(userId: string | undefined, id: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(lastHandledNotificationResponseKey(userId), id);
  } catch {
    /* best-effort */
  }
}
