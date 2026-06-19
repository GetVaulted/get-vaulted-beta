import { Platform } from 'react-native';
import { getWebApiBaseUrl } from './webApiBaseUrl';
import { isSupabaseConfigured } from './supabase';

/** Apple OAuth in Supabase (issuer https://appleid.apple.com). Enabled on iOS unless explicitly off. */
export function isAppleOAuthProviderEnabled(): boolean {
  const flag = process.env.EXPO_PUBLIC_AUTH_APPLE_ENABLED?.trim();
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return Platform.OS === 'ios';
}

/** Google OAuth needs Supabase + a redirect URL allowlisted in the dashboard. */
export function isGoogleOAuthConfigured(): boolean {
  if (!isSupabaseConfigured()) return false;
  return Boolean(getWebApiBaseUrl());
}

export function googleOAuthNotConfiguredMessage(): string {
  if (!isSupabaseConfigured()) {
    return 'Social sign-in is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.';
  }
  return 'Google sign-in needs EXPO_PUBLIC_SITE_URL (or EXPO_PUBLIC_WEB_API_URL) pointing at your Get Vaulted web app.';
}

export function isAppleProviderDisabledError(message: string): boolean {
  const m = message.toLowerCase();
  if (/appleid\.apple\.com/i.test(message) && /not enabled/i.test(message)) return true;
  return m.includes('apple provider') && m.includes('not enabled');
}
