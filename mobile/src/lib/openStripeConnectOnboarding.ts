import { Linking } from 'react-native';
import {
  createSellerOnboardingLink,
  type SellerConnectStatusResponse,
} from '../api/stripeConnectRepository';
import { getWebApiBaseUrl } from './webApiBaseUrl';

/** Hosted Stripe Connect onboarding opened in the system browser (Safari / Chrome). */
export type StripeConnectOnboardingResult = 'opened';

function stripeUrlMeta(stripeUrl: string): { stripeHost: string; stripeUrlPrefix: string } {
  try {
    const u = new URL(stripeUrl);
    return { stripeHost: u.host, stripeUrlPrefix: stripeUrl.slice(0, 72) };
  } catch {
    return { stripeHost: 'invalid', stripeUrlPrefix: stripeUrl.slice(0, 72) };
  }
}

/**
 * Opens Stripe Connect hosted onboarding in the system browser via Linking.openURL.
 * Not OAuth — do not use openAuthSessionAsync. Reconcile after the user returns to the app.
 */
export async function openStripeConnectOnboarding(
  accessToken: string,
): Promise<StripeConnectOnboardingResult> {
  if (!getWebApiBaseUrl()) {
    throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  }

  const { url: stripeUrl } = await createSellerOnboardingLink(accessToken);
  if (!stripeUrl?.startsWith('http')) {
    throw new Error('Server did not return a valid Stripe onboarding URL.');
  }

  const meta = stripeUrlMeta(stripeUrl);
  console.info('[stripe-connect] onboarding_url_ready', JSON.stringify(meta));

  console.info('[stripe-connect] opening_external_browser');
  try {
    const canOpen = await Linking.canOpenURL(stripeUrl);
    if (!canOpen) {
      throw new Error('This device cannot open the Stripe onboarding link.');
    }
    await Linking.openURL(stripeUrl);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.info('[stripe-connect] external_browser_failed', JSON.stringify({ error }));
    throw new Error(`Could not open Stripe setup: ${error}`);
  }

  console.info('[stripe-connect] external_browser_opened');
  return 'opened';
}

/** Stripe may take a moment to enable payouts after redirect — poll until ready or timeout. */
export async function refreshSellerConnectAfterOnboarding(
  refresh: () => Promise<SellerConnectStatusResponse | null>,
  opts?: { attempts?: number; delayMs?: number },
): Promise<SellerConnectStatusResponse | null> {
  const attempts = opts?.attempts ?? 4;
  const delayMs = opts?.delayMs ?? 1200;
  let latest: SellerConnectStatusResponse | null = null;
  for (let i = 0; i < attempts; i++) {
    latest = await refresh();
    if (latest && (latest.payout_setup_complete || latest.can_publish_active_listings || latest.payout_setup_submitted)) {
      return latest;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return latest;
}
