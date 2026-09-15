import { fetchProfileSetupStatus } from '../api/profileSetupRepository';
import { getSupabase } from '../lib/supabase';
import { shouldPromptNotificationPermission } from '../push/notificationPermissionGate';
import type { RootStackParamList } from './types';

type AfterSignInNavigation = {
  reset: (state: {
    index: number;
    routes: Array<{ name: keyof RootStackParamList; params?: object }>;
  }) => void;
  canGoBack?: () => boolean;
  goBack?: () => void;
};

type NavigateAfterSignInOpts = {
  preferGoBack?: boolean;
  /** Signup / first-time account paths use stronger copy on the permission screen. */
  notificationSource?: 'signup' | 'login';
};

function goHome(navigation: AfterSignInNavigation) {
  navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] });
}

async function goHomeOrNotificationPermission(
  navigation: AfterSignInNavigation,
  source: 'signup' | 'login',
): Promise<void> {
  if (await shouldPromptNotificationPermission()) {
    navigation.reset({
      index: 0,
      routes: [{ name: 'NotificationPermission', params: { source } }],
    });
    return;
  }
  goHome(navigation);
}

/**
 * Route after a successful sign-in. Google/Apple users often still need the
 * username confirmation screen — never send them straight to Home in that case.
 * When push permission is not granted, send them through NotificationPermission
 * (signup + next login) before Home.
 *
 * Fail closed: if we cannot load setup status, send them to CompleteProfileSetup.
 * That screen re-checks and forwards home when setup is already done.
 */
export async function navigateAfterSignIn(
  navigation: AfterSignInNavigation,
  opts?: NavigateAfterSignInOpts,
): Promise<void> {
  const notificationSource = opts?.notificationSource ?? 'login';

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
    // Do not skip username setup on a flaky status call — Apple/Google users would
    // otherwise land in the app with an auto-allocated username and never confirm it.
    needsSetup = true;
  }

  if (needsSetup) {
    navigation.reset({ index: 0, routes: [{ name: 'CompleteProfileSetup' }] });
    return;
  }

  // Prefer notification prompt over goBack — existing users who never enabled
  // should see the ask again on this login.
  if (await shouldPromptNotificationPermission()) {
    navigation.reset({
      index: 0,
      routes: [{ name: 'NotificationPermission', params: { source: notificationSource } }],
    });
    return;
  }

  if (opts?.preferGoBack && navigation.canGoBack?.()) {
    navigation.goBack?.();
    return;
  }

  goHome(navigation);
}

/** After password signup (or profile setup) when setup is already complete. */
export async function navigateAfterAccountReady(
  navigation: AfterSignInNavigation,
  source: 'signup' | 'login' = 'signup',
): Promise<void> {
  await goHomeOrNotificationPermission(navigation, source);
}
