import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ANDROID_NAV_BAR_FALLBACK, resolvedBottomInset } from './bottomInset';

export { ANDROID_NAV_BAR_FALLBACK, resolvedBottomInset };

export function useScreenSafeInsets() {
  const insets = useSafeAreaInsets();
  return {
    top: insets.top,
    left: insets.left,
    right: insets.right,
    bottom: resolvedBottomInset(insets.bottom),
  };
}
