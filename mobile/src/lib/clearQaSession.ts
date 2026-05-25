import { Alert } from 'react-native';
import { recoverFromStaleAuthSession } from './recoverInvalidAuthSession';
import { navigateToAuthWelcome } from '../navigation/rootNavigationRef';

/**
 * Hard QA reset: sign out, wipe auth + feed caches, return to login.
 * Use on every device before manual QA when env/session drift is suspected.
 */
export async function performClearQaSession(signOut: () => Promise<void>): Promise<void> {
  try {
    await signOut();
  } catch {
    /* continue */
  }
  await recoverFromStaleAuthSession({ signOut: false, navigate: false });
  navigateToAuthWelcome();
}

export function confirmClearQaSession(signOut: () => Promise<void>): void {
  Alert.alert(
    'Clear QA session?',
    'Signs out, clears auth tokens and live discovery cache, and returns to login. Use when devices show different data.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          void performClearQaSession(signOut);
        },
      },
    ],
  );
}
