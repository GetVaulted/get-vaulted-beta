import { Alert } from 'react-native';
import { clearHomeFeedCache } from './homeFeedCache';
import { navigateToAuthWelcome } from '../navigation/rootNavigationRef';
import { clearCanonicalUserIdCache } from '../hooks/useCanonicalUserId';
import { clearNotificationStore } from '../platform/notificationStore';
import { revokePushRegistrationForSession } from '../push/pushRegistrationService';
import { resetCreateListingDraftForSignOut } from '../createListing/CreateListingDraftContext';
import { clearLiveStreamPrefetchCache } from './liveStreamPrefetchCache';
import { clearBuyerPreferredShippingRateKey } from './buyerShippingPreference';

export type SignOutSessionOptions = {
  accessToken?: string;
  supabaseUserId?: string;
};

export function signOutSessionOptions(
  user: { id: string } | null | undefined,
  session: { access_token: string } | null | undefined,
): SignOutSessionOptions | undefined {
  if (!user?.id || !session?.access_token) return undefined;
  return { accessToken: session.access_token, supabaseUserId: user.id };
}

/** Clears Supabase session, local feed cache, push registration, and returns to the auth stack. */
export async function performSignOut(
  signOut: () => Promise<void>,
  opts?: SignOutSessionOptions,
): Promise<void> {
  if (opts?.accessToken && opts.supabaseUserId) {
    try {
      await revokePushRegistrationForSession({
        accessToken: opts.accessToken,
        supabaseUserId: opts.supabaseUserId,
      });
    } catch {
      /* still sign out */
    }
  }
  try {
    await signOut();
  } catch {
    /* still reset local state */
  }
  clearCanonicalUserIdCache();
  try {
    await clearNotificationStore();
  } catch {
    /* ignore */
  }
  try {
    await clearHomeFeedCache();
  } catch {
    /* ignore */
  }
  try {
    resetCreateListingDraftForSignOut();
  } catch {
    /* ignore */
  }
  clearLiveStreamPrefetchCache();
  try {
    await clearBuyerPreferredShippingRateKey(opts?.supabaseUserId);
  } catch {
    /* ignore */
  }
  navigateToAuthWelcome();
}

export function confirmAndSignOut(
  signOut: () => Promise<void>,
  opts?: SignOutSessionOptions,
): void {
  Alert.alert('Sign out?', 'You will return to the login screen. Use this to switch test accounts or refresh your session.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Sign out',
      style: 'destructive',
      onPress: () => {
        void performSignOut(signOut, opts);
      },
    },
  ]);
}
