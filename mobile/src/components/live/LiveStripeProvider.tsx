import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { fetchBuyerWalletSummary } from '../../api/buyerWalletRepository';
import { fetchAppAuthConfig } from '../../lib/fetchAppAuthConfig';

const STRIPE_MERCHANT_IDENTIFIER = 'merchant.com.getvaulted.app';
const STRIPE_URL_SCHEME = 'getvaulted';

type ConfirmPayment = ReturnType<typeof useStripe>['confirmPayment'];

const LiveStripeReadyContext = createContext(false);
const LiveConfirmPaymentContext = createContext<ConfirmPayment | null>(null);

let cachedPublishableKey: string | null =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
let prefetchInflight: Promise<string | null> | null = null;

function envStripePublishableKey(): string | null {
  return process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
}

function rememberPublishableKey(pk: string | null | undefined): string | null {
  const next = pk?.trim() || null;
  if (next) cachedPublishableKey = next;
  return next;
}

/**
 * Warm the Stripe publishable key early (app boot / auth ready) so live rooms
 * rarely wait on `/api/auth/config` at room entry.
 */
export function prefetchStripePublishableKey(accessToken?: string): void {
  if (cachedPublishableKey || prefetchInflight) return;
  prefetchInflight = resolveStripePublishableKey(accessToken).finally(() => {
    prefetchInflight = null;
  });
}

async function resolveStripePublishableKey(accessToken?: string): Promise<string | null> {
  if (cachedPublishableKey) return cachedPublishableKey;
  const fromEnv = envStripePublishableKey();
  if (fromEnv) return rememberPublishableKey(fromEnv);

  const token = accessToken?.trim();
  const [wallet, cfg] = await Promise.all([
    token
      ? fetchBuyerWalletSummary(token).catch(() => null)
      : Promise.resolve(null),
    fetchAppAuthConfig().catch(() => null),
  ]);

  return (
    rememberPublishableKey(wallet?.stripePublishableKey) ||
    rememberPublishableKey(cfg?.stripePublishableKey) ||
    null
  );
}

export function useLiveStripeReady(): boolean {
  return useContext(LiveStripeReadyContext);
}

/** Stripe `confirmPayment` when the provider has a key; null while still resolving. */
export function useLiveConfirmPayment(): ConfirmPayment | null {
  return useContext(LiveConfirmPaymentContext);
}

function StripeConfirmBridge({ children }: { children: ReactNode }) {
  const { confirmPayment } = useStripe();
  return (
    <LiveConfirmPaymentContext.Provider value={confirmPayment}>
      {children}
    </LiveConfirmPaymentContext.Provider>
  );
}

/**
 * Live commerce calls `confirmPayment` on room entry. Room UI paints immediately;
 * Stripe mounts as soon as a publishable key is available (env, cache, or network).
 */
export function LiveStripeProvider({
  accessToken,
  children,
}: {
  accessToken?: string;
  children: ReactElement | ReactElement[];
}) {
  const [publishableKey, setPublishableKey] = useState<string | null>(
    () => cachedPublishableKey || envStripePublishableKey(),
  );

  useEffect(() => {
    if (publishableKey) return;
    let cancelled = false;
    void resolveStripePublishableKey(accessToken).then((pk) => {
      if (!cancelled && pk) setPublishableKey(pk);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, publishableKey]);

  if (!publishableKey) {
    return (
      <LiveStripeReadyContext.Provider value={false}>
        <LiveConfirmPaymentContext.Provider value={null}>
          {children}
        </LiveConfirmPaymentContext.Provider>
      </LiveStripeReadyContext.Provider>
    );
  }

  return (
    <LiveStripeReadyContext.Provider value={true}>
      <StripeProvider
        publishableKey={publishableKey}
        merchantIdentifier={STRIPE_MERCHANT_IDENTIFIER}
        urlScheme={STRIPE_URL_SCHEME}
      >
        <StripeConfirmBridge>{children}</StripeConfirmBridge>
      </StripeProvider>
    </LiveStripeReadyContext.Provider>
  );
}
