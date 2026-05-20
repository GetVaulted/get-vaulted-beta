import { Alert } from 'react-native';
import { clearHomeFeedCache } from './homeFeedCache';
import { navigateToAuthWelcome } from '../navigation/rootNavigationRef';

/** Clears Supabase session, local feed cache, and returns to the auth stack. */
export async function performSignOut(signOut: () => Promise<void>): Promise<void> {
  try {
    await signOut();
  } catch {
    /* still reset local state */
  }
  try {
    await clearHomeFeedCache();
  } catch {
    /* ignore */
  }
  navigateToAuthWelcome();
}

export function confirmAndSignOut(signOut: () => Promise<void>): void {
  Alert.alert('Sign out?', 'You will return to the login screen. Use this to switch test accounts or refresh your session.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Sign out',
      style: 'destructive',
      onPress: () => {
        void performSignOut(signOut);
      },
    },
  ]);
}
