import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';

/** App default — matches app.json userInterfaceStyle. */
const APP_COLOR_SCHEME = 'dark';

/**
 * Stripe CardForm inherits UIKit dark-mode text colors when the app is dark.
 * Force light appearance while the payment form is visible so typed digits stay dark on white.
 */
export function usePaymentFormLightAppearance(active: boolean): boolean {
  const [nativeReady, setNativeReady] = useState(false);

  useEffect(() => {
    if (!active) {
      setNativeReady(false);
      Appearance.setColorScheme(APP_COLOR_SCHEME);
      return;
    }

    Appearance.setColorScheme('light');
    const frame = requestAnimationFrame(() => setNativeReady(true));
    const fallback = setTimeout(() => setNativeReady(true), 120);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
      setNativeReady(false);
      Appearance.setColorScheme(APP_COLOR_SCHEME);
    };
  }, [active]);

  return nativeReady;
}
