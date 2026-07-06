import { Alert } from 'react-native';
import { recoverFromStaleAuthSession } from './recoverInvalidAuthSession';
import { performSignOut, type SignOutSessionOptions } from './signOutSession';

/**
 * Hard QA reset: full `performSignOut` teardown (push token revocation, notification store, feed
 * cache, create-listing draft state, live-stream prefetch cache, buyer shipping preference — see
 * `signOutSession.ts`), PLUS a QA-specific force-wipe of any stored Supabase tokens even if the
 * network sign-out call above failed (e.g. an already-dead refresh token), so the next login on
 * this device always starts from a clean slate.
 * Use on every device before manual QA when env/session drift is suspected.
 */
export async function performClearQaSession(
  signOut: () => Promise<void>,
  opts?: SignOutSessionOptions,
): Promise<void> {
  await performSignOut(signOut, opts);
  await recoverFromStaleAuthSession({ signOut: false, navigate: false });
}

export function confirmClearQaSession(signOut: () => Promise<void>, opts?: SignOutSessionOptions): void {
  Alert.alert(
    'Clear QA session?',
    'Signs out, clears auth tokens and live discovery cache, and returns to login. Use when devices show different data.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          void performClearQaSession(signOut, opts);
        },
      },
    ],
  );
}
