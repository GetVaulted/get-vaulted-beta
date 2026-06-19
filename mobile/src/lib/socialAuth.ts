import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import {
  googleOAuthNotConfiguredMessage,
  isAppleOAuthProviderEnabled,
  isAppleProviderDisabledError,
  isGoogleOAuthConfigured,
} from './authProviderAvailability';
import { provisionSocialAuthAccount } from './provisionSocialAuthAccount';
import { ensureSupabaseReady, getSupabase, isSupabaseConfigured } from './supabase';
import { getWebApiBaseUrl } from './webApiBaseUrl';

WebBrowser.maybeCompleteAuthSession();

export type SocialAuthResult = 'success' | 'cancel' | 'error';

/** OAuth return URL allowlisted in Supabase (`getvaulted://auth/callback` on native). */
export function getMobileOAuthRedirectUrl(): string {
  if (Platform.OS === 'web') {
    const base = getWebApiBaseUrl();
    if (base) return `${base.replace(/\/+$/, '')}/mobile/auth/callback`;
  }
  return makeRedirectUri({ scheme: 'getvaulted', path: 'auth/callback' });
}

/** Apple requires a SHA-256 hashed nonce; Supabase validates the raw nonce on signInWithIdToken. */
export async function createAppleSignInNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

const devAuthLog = __DEV__
  ? (...args: unknown[]) => {
      console.log('[auth:social]', ...args);
    }
  : () => {};

export async function signInWithGoogleOAuth(): Promise<SocialAuthResult> {
  if (!isGoogleOAuthConfigured()) {
    throw new Error(googleOAuthNotConfiguredMessage());
  }
  await ensureSupabaseReady();
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY).');
  }
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase client unavailable.');

  const redirectTo = getMobileOAuthRedirectUrl();
  devAuthLog('start', { redirectTo });
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) {
    devAuthLog('oauth error', error.message);
    throw error;
  }
  if (!data.url) throw new Error('Google sign-in could not start. Check Supabase Google provider settings.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    showInRecents: false,
    preferEphemeralSession: false,
    createTask: false,
  });

  devAuthLog('browser result', result.type);
  if (result.type === 'cancel') return 'cancel';
  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in did not complete. Check redirect URLs in Supabase Auth settings.');
  }

  const { error: exchangeError } = await sb.auth.exchangeCodeForSession(result.url);
  if (exchangeError) {
    devAuthLog('exchange error', exchangeError.message);
    throw exchangeError;
  }
  await provisionSocialAuthAccount();
  devAuthLog('success');
  return 'success';
}

export async function signInWithAppleOAuth(): Promise<SocialAuthResult> {
  if (!isAppleOAuthProviderEnabled()) {
    throw new Error('Apple Sign In is not available on this build.');
  }
  if (Platform.OS !== 'ios') {
    throw new Error('Apple Sign In is only available on iOS.');
  }

  const AppleAuthentication = await import('expo-apple-authentication');
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) throw new Error('Apple Sign In is not available on this device.');

  await ensureSupabaseReady();
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase client unavailable.');

  try {
    const { raw: appleNonce, hashed: appleNonceHashed } = await createAppleSignInNonce();
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: appleNonceHashed,
    });

    if (!credential.identityToken) {
      throw new Error('Apple did not return a sign-in token.');
    }

    const { error } = await sb.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: appleNonce,
    });
    if (error) {
      if (isAppleProviderDisabledError(error.message)) {
        throw new Error('Apple Sign In is not configured yet. Use email or Google, or try again later.');
      }
      throw error;
    }

    const given = credential.fullName?.givenName?.trim() ?? '';
    const family = credential.fullName?.familyName?.trim() ?? '';
    const displayName = [given, family].filter(Boolean).join(' ').trim();
    if (displayName) {
      const { error: metaError } = await sb.auth.updateUser({
        data: {
          display_name: displayName,
          full_name: displayName,
        },
      });
      if (metaError && __DEV__) {
        devAuthLog('apple metadata update', metaError.message);
      }
    }

    await provisionSocialAuthAccount();
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
  if (!isAppleOAuthProviderEnabled()) return false;
  if (Platform.OS !== 'ios') return false;
  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    return AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}
