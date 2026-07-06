import AsyncStorage from '@react-native-async-storage/async-storage';

/** @deprecated Pre-2026-07 device-wide keys — kept only for the one-time per-user migration in
 * `readSellerWizardComplete`/`readSellerHqActivated` below. Never write to these directly. */
export const SELLER_WIZARD_COMPLETE_KEY = 'gv_seller_wizard_complete';
export const SELLER_HQ_ACTIVATED_KEY = 'gv_seller_hq_activated';
export const SELLER_WIZARD_COMPLETE_EVENT = 'gv-seller-wizard-complete';

/**
 * A device-wide legacy flag can't be reliably attributed to a single "true owner" once more than
 * one account has signed into the same device across the upgrade boundary — that ambiguity is
 * inherent and unfixable after the fact. What we CAN control is blast radius and reversibility:
 *
 *  - We never delete the legacy key. Deleting it after the first read is what made the original
 *    migration unsafe: if the wrong user read it first, the real owner could never receive it
 *    later because the only record of it was already gone.
 *  - We only let a bounded number of distinct user ids adopt the legacy value as their own
 *    per-user starting point (see `MAX_LEGACY_MIGRATION_USERS`). This keeps the "seamlessly carry
 *    forward my old setup state" UX for the handful of real candidates a shared device is likely
 *    to have, without letting the flag propagate to an unbounded number of unrelated accounts
 *    forever.
 *  - Once a user has an explicit per-user value (scoped key set, migrated or not), that value is
 *    always authoritative for them — the legacy fallback is only ever consulted for a user who
 *    has no scoped value of their own yet.
 *
 * This is a belt-and-suspenders local cache anyway: callers that gate real actions (e.g.
 * `useSellerSetupState`, `openCreateListing`) always reconcile this local value against the
 * server's `setupWizardComplete`/`sellerSetupWizardCompletedAt` shortly after reading it, and
 * clear an incorrectly-migrated local flag via `clearSellerWizardComplete` when the server
 * explicitly says the signed-in user hasn't completed setup. So even a wrongly-migrated flag is a
 * transient optimistic hint, not a permanent, unrecoverable grant. See FIX 1, cross-account
 * data-leak audit follow-up, 2026-07.
 */
const MAX_LEGACY_MIGRATION_USERS = 3;
const LEGACY_WIZARD_MIGRATED_USERS_KEY = 'gv_seller_wizard_legacy_migrated_users';
const LEGACY_HQ_MIGRATED_USERS_KEY = 'gv_seller_hq_legacy_migrated_users';

/** Per-user key so one account's seller-setup completion never leaks into a different account
 * signed into the same device without a force-quit (cross-account data-leak audit, 2026-07). */
export function sellerWizardCompleteKey(userId: string): string {
  return `${SELLER_WIZARD_COMPLETE_KEY}:${userId}`;
}

export function sellerHqActivatedKey(userId: string): string {
  return `${SELLER_HQ_ACTIVATED_KEY}:${userId}`;
}

async function readMigratedUserIds(trackerKey: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(trackerKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Reads a legacy device-wide flag and, if set, migrates it onto `userId`'s scoped key — but only
 * for up to `MAX_LEGACY_MIGRATION_USERS` distinct user ids, and without ever deleting the legacy
 * value. See module-level doc comment above for the full reasoning.
 */
async function migrateLegacyFlag(
  userId: string,
  legacyKey: string,
  scopedKeyFor: (id: string) => string,
  trackerKey: string,
): Promise<boolean> {
  const legacy = await AsyncStorage.getItem(legacyKey);
  if (legacy !== '1') return false;

  const migratedUserIds = await readMigratedUserIds(trackerKey);
  if (migratedUserIds.includes(userId)) {
    // Defensive only: normally the scoped key would already exist once a user is in this list.
    await AsyncStorage.setItem(scopedKeyFor(userId), '1');
    return true;
  }
  if (migratedUserIds.length >= MAX_LEGACY_MIGRATION_USERS) return false;

  await AsyncStorage.setItem(scopedKeyFor(userId), '1');
  await AsyncStorage.setItem(trackerKey, JSON.stringify([...migratedUserIds, userId]));
  return true;
}

/**
 * Reads the per-user flag. If it was never set for this user, falls back to the bounded legacy
 * migration above. A user whose scoped key was never set (and no legacy value exists, or the
 * legacy migration cap has been reached) correctly falls back to "not complete" rather than any
 * previous account's value.
 */
export async function readSellerWizardComplete(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const scoped = await AsyncStorage.getItem(sellerWizardCompleteKey(userId));
    if (scoped != null) return scoped === '1';
    return await migrateLegacyFlag(
      userId,
      SELLER_WIZARD_COMPLETE_KEY,
      sellerWizardCompleteKey,
      LEGACY_WIZARD_MIGRATED_USERS_KEY,
    );
  } catch {
    return false;
  }
}

export async function readSellerHqActivated(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const scoped = await AsyncStorage.getItem(sellerHqActivatedKey(userId));
    if (scoped != null) return scoped === '1';
    return await migrateLegacyFlag(
      userId,
      SELLER_HQ_ACTIVATED_KEY,
      sellerHqActivatedKey,
      LEGACY_HQ_MIGRATED_USERS_KEY,
    );
  } catch {
    return false;
  }
}

export async function markSellerWizardCompleteLocal(userId: string | undefined): Promise<void> {
  if (!userId) return;
  await AsyncStorage.setItem(sellerWizardCompleteKey(userId), '1');
}

export async function markSellerHqActivatedLocal(userId: string | undefined): Promise<void> {
  if (!userId) return;
  await AsyncStorage.setItem(sellerHqActivatedKey(userId), '1');
}

/**
 * Explicitly marks this user's wizard-complete flag as false — used when the server confirms a
 * previously-set local flag was wrong (e.g. incorrectly migrated from the shared legacy key, or
 * the user backed out of the final wizard step). Writes an explicit `'0'` rather than removing
 * the key so that this user's value is now treated as authoritative and never falls back to the
 * (still-present) legacy device-wide flag again.
 */
export async function clearSellerWizardComplete(userId: string | undefined): Promise<void> {
  if (!userId) return;
  await AsyncStorage.setItem(sellerWizardCompleteKey(userId), '0');
}
