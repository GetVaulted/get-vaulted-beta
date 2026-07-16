import { fetchProfileSetupStatus } from '../api/profileSetupRepository';
import { getSupabase } from '../lib/supabase';
import type { RootStackParamList } from './types';

type AfterSignInNavigation = {
  reset: (state: {
    index: number;
    routes: Array<{ name: keyof RootStackParamList; params?: object }>;
  }) => void;
  canGoBack?: () => boolean;
  goBack?: () => void;
};

/**
 * Route after a successful sign-in. Google/Apple users often still need the
 * username confirmation screen — never send them straight to Home in that case.
 */
export async function navigateAfterSignIn(
  navigation: AfterSignInNavigation,
  opts?: { preferGoBack?: boolean },
): Promise<void> {
  let needsSetup = false;
  try {
    const sb = getSupabase();
    const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (token) {
      const status = await fetchProfileSetupStatus(token);
      needsSetup = status.needsSetup;
    }
  } catch {
    // If status check fails, fall through to the normal post-auth destination.
  }

  if (needsSetup) {
    navigation.reset({ index: 0, routes: [{ name: 'CompleteProfileSetup' }] });
    return;
  }

  if (opts?.preferGoBack && navigation.canGoBack?.()) {
    navigation.goBack?.();
    return;
  }

  navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] });
}
