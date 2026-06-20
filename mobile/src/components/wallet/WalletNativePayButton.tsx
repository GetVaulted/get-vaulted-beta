import {
  isPlatformPaySupported,
  PlatformPay,
  PlatformPayButton,
  StripeProvider,
} from '@stripe/stripe-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { shouldShowApplePay, shouldShowGooglePay } from '../../lib/paymentMethodCatalog';
import { LiveRoomText } from '../live/LiveRoomText';

const STRIPE_MERCHANT_IDENTIFIER = 'merchant.com.getvaulted.app';
const STRIPE_URL_SCHEME = 'getvaulted';

type Props = {
  publishableKey?: string | null;
  onPress: () => void;
  /** Dark wallet UI uses white Apple Pay button; light setup uses black. */
  appearance?: 'dark' | 'light';
  disabled?: boolean;
};

function NativePayFallbackRow({
  onPress,
  appearance = 'dark',
  disabled = false,
}: {
  onPress: () => void;
  appearance?: 'dark' | 'light';
  disabled?: boolean;
}) {
  const isIos = Platform.OS === 'ios';
  const label = isIos ? 'Set up Apple Pay' : 'Set up Google Pay';
  const dark = appearance === 'dark';

  return (
    <Pressable
      style={[styles.fallbackBtn, dark ? styles.fallbackBtnDark : styles.fallbackBtnLight]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={isIos ? 'logo-apple' : 'logo-google'} size={20} color={dark ? '#fff' : '#111'} />
      <LiveRoomText style={[styles.fallbackLabel, dark ? styles.fallbackLabelDark : styles.fallbackLabelLight]}>
        {label}
      </LiveRoomText>
    </Pressable>
  );
}

function NativePayButtonInner({
  onPress,
  appearance = 'dark',
  disabled = false,
}: Omit<Props, 'publishableKey'>) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void isPlatformPaySupported()
      .then((ok) => {
        if (mountedRef.current) setSupported(ok);
      })
      .catch(() => {
        if (mountedRef.current) setSupported(false);
      });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  if (platform !== 'ios' && platform !== 'android') return null;

  const showApple = shouldShowApplePay(platform, supported === true);
  const showGoogle = shouldShowGooglePay(platform, supported === true);
  if (supported === false) {
    return <NativePayFallbackRow onPress={onPress} appearance={appearance} disabled={disabled} />;
  }
  if (supported === true && !showApple && !showGoogle) {
    return <NativePayFallbackRow onPress={onPress} appearance={appearance} disabled={disabled} />;
  }

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

/** Official Stripe native Apple Pay / Google Pay button with text fallback when unavailable. */
export function WalletNativePayButton({ publishableKey, onPress, appearance, disabled }: Props) {
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  if (platform !== 'ios' && platform !== 'android') return null;

  if (!publishableKey?.trim()) {
    return (
      <NativePayFallbackRow onPress={onPress} appearance={appearance} disabled={disabled} />
    );
  }

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
  fallbackBtn: {
    width: '100%',
    minHeight: 48,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  fallbackBtnDark: {
    backgroundColor: '#fff',
  },
  fallbackBtnLight: {
    backgroundColor: '#111',
  },
  fallbackLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  fallbackLabelDark: {
    color: '#111',
  },
  fallbackLabelLight: {
    color: '#fff',
  },
});
