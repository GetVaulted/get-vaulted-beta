import { StripeProvider } from '@stripe/stripe-react-native';
import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { fetchBuyerWalletSummary } from '../../api/buyerWalletRepository';
import { fetchAppAuthConfig } from '../../lib/fetchAppAuthConfig';
import { colors } from '../../theme';

const STRIPE_MERCHANT_IDENTIFIER = 'merchant.com.getvaulted.app';
const STRIPE_URL_SCHEME = 'getvaulted';

function envStripePublishableKey(): string | null {
  return process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
}

/**
 * Live commerce calls `useStripe()` on room entry. Without this provider the app hard-crashes.
 */
export function LiveStripeProvider({
  accessToken,
  children,
}: {
  accessToken?: string;
  children: ReactElement | ReactElement[];
}) {
  const [publishableKey, setPublishableKey] = useState<string | null>(envStripePublishableKey);

  useEffect(() => {
    if (publishableKey) return;
    let cancelled = false;

    (async () => {
      if (accessToken?.trim()) {
        try {
          const wallet = await fetchBuyerWalletSummary(accessToken);
          const pk = wallet?.stripePublishableKey?.trim();
          if (pk && !cancelled) {
            setPublishableKey(pk);
            return;
          }
        } catch {
          // fall through to public config
        }
      }

      const cfg = await fetchAppAuthConfig();
      const pk = cfg?.stripePublishableKey?.trim();
      if (pk && !cancelled) setPublishableKey(pk);
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, publishableKey]);

  if (!publishableKey) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier={STRIPE_MERCHANT_IDENTIFIER}
      urlScheme={STRIPE_URL_SCHEME}
    >
      {children}
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
