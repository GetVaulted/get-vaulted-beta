import {
  isPlatformPaySupported,
  PlatformPay,
  PlatformPayButton,
  StripeProvider,
} from '@stripe/stripe-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { shouldShowApplePay, shouldShowGooglePay } from '../../lib/paymentMethodCatalog';

const STRIPE_MERCHANT_IDENTIFIER = 'merchant.com.getvaulted.app';
const STRIPE_URL_SCHEME = 'getvaulted';

type Props = {
  publishableKey: string;
  onPress: () => void;
  /** Dark wallet UI uses white Apple Pay button; light setup uses black. */
  appearance?: 'dark' | 'light';
  disabled?: boolean;
};

let platformPaySupportCache: boolean | null = null;
let platformPaySupportInflight: Promise<boolean> | null = null;

async function resolvePlatformPaySupported(): Promise<boolean> {
  if (platformPaySupportCache === true) return true;
  if (!platformPaySupportInflight) {
    platformPaySupportInflight = isPlatformPaySupported()
      .then((ok) => {
        if (ok) platformPaySupportCache = true;
        return ok;
      })
      .catch(() => false)
      .finally(() => {
        platformPaySupportInflight = null;
      });
  }
  return platformPaySupportInflight;
}

function NativePayButtonInner({
  onPress,
  appearance = 'dark',
  disabled = false,
}: Omit<Props, 'publishableKey'>) {
  const [supported, setSupported] = useState<boolean | null>(
    platformPaySupportCache === true ? true : null,
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (platformPaySupportCache === true) {
      setSupported(true);
      return;
    }
    void resolvePlatformPaySupported().then((ok) => {
      if (mountedRef.current) setSupported(ok);
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  const expectsNativePay = platform === 'ios' || platform === 'android';
  if (!expectsNativePay) return null;
  if (supported === false) return null;

  const showApple = shouldShowApplePay(platform, supported === true);
  const showGoogle = shouldShowGooglePay(platform, supported === true);
  if (supported === true && !showApple && !showGoogle) return null;

  const buttonStyle =
    appearance === 'light' ? PlatformPay.ButtonStyle.Black : PlatformPay.ButtonStyle.White;

  return (
    <View style={styles.wrap}>
      {supported === null ? (
        <View style={styles.loadingSlot}>
          <ActivityIndicator color={appearance === 'light' ? '#111' : '#fff'} size="small" />
        </View>
      ) : (
        <PlatformPayButton
          type={PlatformPay.ButtonType.Default}
          appearance={buttonStyle}
          borderRadius={10}
          onPress={onPress}
          disabled={disabled || !supported}
          style={styles.button}
        />
      )}
    </View>
  );
}

/** Official Stripe native Apple Pay / Google Pay button for wallet add flows. */
export function WalletNativePayButton({ publishableKey, onPress, appearance, disabled }: Props) {
  if (!publishableKey.trim()) return null;
  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier={STRIPE_MERCHANT_IDENTIFIER}
      urlScheme={STRIPE_URL_SCHEME}
    >
      <NativePayButtonInner onPress={onPress} appearance={appearance} disabled={disabled} />
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    minHeight: 48,
  },
  loadingSlot: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: '100%',
    height: 48,
  },
});
