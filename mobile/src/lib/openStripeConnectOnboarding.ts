import * as WebBrowser from 'expo-web-browser';
import {
  createSellerOnboardingLink,
  type SellerConnectStatusResponse,
} from '../api/stripeConnectRepository';
import { getWebApiBaseUrl } from './webApiBaseUrl';

export type StripeConnectOnboardingResult = 'success' | 'cancel' | 'dismiss';

/** Must match Next.js `return_url` / `refresh_url` in create-onboarding-link (path prefix). */
export function getStripeConnectReturnUrlPrefix(): string | null {
  const base = getWebApiBaseUrl();
  if (!base) return null;
  return `${base}/mobile/stripe-connect-return`;
}

/**
 * Opens Stripe Connect hosted onboarding in an in-app auth session (Safari VC / Chrome Custom Tab).
 * Completes when Stripe redirects to `/mobile/stripe-connect-return` on your API host.
 */
export async function openStripeConnectOnboarding(accessToken: string): Promise<StripeConnectOnboardingResult> {
  const returnUrl = getStripeConnectReturnUrlPrefix();
  if (!returnUrl) {
    throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  }

  const { url } = await createSellerOnboardingLink(accessToken);

  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl, {
    showInRecents: false,
    preferEphemeralSession: true,
  });

  if (result.type === 'success') return 'success';
  if (result.type === 'cancel') return 'cancel';
  return 'dismiss';
}

/** Stripe may take a moment to enable payouts after redirect — refresh status twice. */
export async function refreshSellerConnectAfterOnboarding(
  refresh: () => Promise<SellerConnectStatusResponse | null>,
): Promise<SellerConnectStatusResponse | null> {
  let latest = await refresh();
  await new Promise((r) => setTimeout(r, 1500));
  latest = await refresh();
  return latest;
}
