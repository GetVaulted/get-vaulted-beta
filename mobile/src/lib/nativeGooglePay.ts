import * as Application from 'expo-application';
import { Platform } from 'react-native';

/**
 * Google Pay needs `enableGooglePay` in the Stripe config plugin, which first shipped in the
 * Android 1.1.0 binary (versionCode 252). Over-the-air JS can also run on older binaries
 * (1.0.13 / versionCode 251) that lack it — never offer Google Pay there, or the sheet fails.
 */
export const GOOGLE_PAY_MIN_ANDROID_VERSION_CODE = 252;

export function isGooglePayNativeConfigured(platform: string, nativeBuildVersion: string | null | undefined): boolean {
  if (platform !== 'android') return false;
  const code = Number(nativeBuildVersion);
  return Number.isFinite(code) && code >= GOOGLE_PAY_MIN_ANDROID_VERSION_CODE;
}

export function nativeGooglePayConfigured(): boolean {
  return isGooglePayNativeConfigured(Platform.OS, Application.nativeBuildVersion);
}
