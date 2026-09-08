import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { fetchWebApiMobile } from './fetchWebApiMobile';

/** Quick — this runs on every cold start and must never noticeably delay app boot. */
const CHECK_TIMEOUT_MS = 6000;

/**
 * The build number actually baked into this binary. iOS `buildNumber` (string) and Android
 * `versionCode` (number) are kept equal on every release (see mobile/RELEASE.md), so this is a
 * single comparable integer regardless of platform.
 */
export function getLocalBuildNumber(): number {
  const raw =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

type MinVersionResponse = {
  ios?: { minBuildNumber?: number };
  android?: { minBuildNumber?: number };
};

/**
 * Returns the minimum build number the server currently requires for this platform, or `null` if
 * the check couldn't complete (offline, timeout, server error, unset env var → 0). Callers should
 * treat `null` and `0` identically: fail open, never block someone from opening the app because a
 * version check hiccuped.
 */
export async function fetchMinRequiredBuildNumber(): Promise<number | null> {
  try {
    const res = await fetchWebApiMobile('/api/app/min-version', {}, { timeoutMs: CHECK_TIMEOUT_MS });
    if (!res.ok) return null;
    const json = (await res.json()) as MinVersionResponse;
    const min = Platform.OS === 'ios' ? json.ios?.minBuildNumber : json.android?.minBuildNumber;
    return typeof min === 'number' && Number.isFinite(min) ? min : null;
  } catch {
    return null;
  }
}
