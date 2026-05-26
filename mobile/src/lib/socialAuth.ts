import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getWebApiBaseUrl } from './webApiBaseUrl';

WebBrowser.maybeCompleteAuthSession();

export type SocialAuthResult = 'success' | 'cancel' | 'error';

/** OAuth return URL allowlisted in Supabase (web page or custom scheme fallback). */
export function getMobileOAuthRedirectUrl(): string {
  const base = getWebApiBaseUrl();
  if (base) return `${base.replace(/\/+$/, '')}/mobile/auth/callback`;
  return makeRedirectUri({ scheme: 'getvaulted', path: 'auth/callback' });
}

export async function signInWithGoogleOAuth(): Promise<SocialAuthResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY).');
  }
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase client unavailable.');

  const redirectTo = getMobileOAuthRedirectUrl();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in could not start.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    showInRecents: false,
    preferEphemeralSession: false,
  });

  if (result.type === 'cancel') return 'cancel';
  if (result.type !== 'success' || !result.url) return 'error';

  const { error: exchangeError } = await sb.auth.exchangeCodeForSession(result.url);
  if (exchangeError) throw exchangeError;
  return 'success';
}

export async function signInWithAppleOAuth(): Promise<SocialAuthResult> {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple Sign In is only available on iOS.');
  }

  const AppleAuthentication = await import('expo-apple-authentication');
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) throw new Error('Apple Sign In is not available on this device.');

  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase client unavailable.');

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error('Apple did not return a sign-in token.');
    }

    const { error } = await sb.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) throw error;
    return 'success';
  } catch (e) {
    if (
      e &&
      typeof e === 'object' &&
      'code' in e &&
      (e as { code?: string }).code === 'ERR_REQUEST_CANCELED'
    ) {
      return 'cancel';
    }
    throw e;
  }
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    return AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}
