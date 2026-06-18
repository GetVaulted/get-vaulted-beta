import {
  isPlatformPaySupported,
  PlatformPay,
  PlatformPayButton,
  StripeProvider,
} from '@stripe/stripe-react-native';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { shouldShowApplePay, shouldShowGooglePay } from '../../lib/paymentMethodCatalog';

const STRIPE_MERCHANT_IDENTIFIER = 'merchant.com.getvaulted.app';
const STRIPE_URL_SCHEME = 'getvaulted';

type Props = {
  publishableKey: string;
  onPress: () => void;
  /** Dark wallet UI uses white Apple Pay button; light setup uses black. */
  appearance?: 'dark' | 'light';
};

function NativePayButtonInner({ onPress, appearance = 'dark' }: Omit<Props, 'publishableKey'>) {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ok = await isPlatformPaySupported();
        if (!cancelled) setSupported(ok);
      } catch {
        if (!cancelled) setSupported(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  const showApple = shouldShowApplePay(platform, supported);
  const showGoogle = shouldShowGooglePay(platform, supported);
  if (!showApple && !showGoogle) return null;

  const buttonStyle =
    appearance === 'light' ? PlatformPay.ButtonStyle.Black : PlatformPay.ButtonStyle.White;

  return (
    <View style={styles.wrap}>
      <PlatformPayButton
        type={PlatformPay.ButtonType.Default}
        appearance={buttonStyle}
        borderRadius={10}
        onPress={onPress}
        disabled={!supported}
        style={styles.button}
      />
    </View>
  );
}

/** Official Stripe native Apple Pay / Google Pay button for wallet add flows. */
export function WalletNativePayButton({ publishableKey, onPress, appearance }: Props) {
  if (!publishableKey.trim()) return null;
  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier={STRIPE_MERCHANT_IDENTIFIER}
      urlScheme={STRIPE_URL_SCHEME}
    >
      <NativePayButtonInner onPress={onPress} appearance={appearance} />
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    minHeight: 48,
  },
  button: {
    width: '100%',
    height: 48,
  },
});
