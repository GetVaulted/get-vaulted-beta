import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

/** Stripe SetupIntent result shape from @stripe/stripe-react-native. */
export function paymentMethodIdFromSetupIntent(
  setupIntent:
    | {
        paymentMethod?: { id?: string } | null;
        paymentMethodId?: string | null;
      }
    | undefined
    | null,
): string | null {
  if (!setupIntent) return null;
  const id = setupIntent.paymentMethod?.id ?? setupIntent.paymentMethodId ?? null;
  return typeof id === 'string' && id.startsWith('pm_') ? id : null;
}

export function getWalletApiBaseUrl(): string | null {
  return getWebApiBaseUrl();
}
