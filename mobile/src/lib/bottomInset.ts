import { Platform } from 'react-native';

/** Reserve space when Android edge-to-edge reports 0 before insets settle. */
export const ANDROID_NAV_BAR_FALLBACK = 24;

export function resolvedBottomInset(inset: number): number {
  if (inset > 0) return inset;
  return Platform.OS === 'android' ? ANDROID_NAV_BAR_FALLBACK : 0;
}
