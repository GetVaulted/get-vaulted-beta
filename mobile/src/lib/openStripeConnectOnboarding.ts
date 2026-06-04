import * as WebBrowser from 'expo-web-browser';
import {
  createSellerOnboardingLink,
  type SellerConnectStatusResponse,
} from '../api/stripeConnectRepository';
import { getWebApiBaseUrl } from './webApiBaseUrl';

/** In-app browser modal was shown and closed (any dismiss/cancel is OK). */
export type StripeConnectOnboardingResult = 'closed';

function stripeUrlMeta(stripeUrl: string): { stripeHost: string; stripeUrlPrefix: string } {
  try {
    const u = new URL(stripeUrl);
    return { stripeHost: u.host, stripeUrlPrefix: stripeUrl.slice(0, 72) };
  } catch {
    return { stripeHost: 'invalid', stripeUrlPrefix: stripeUrl.slice(0, 72) };
  }
}

/**
 * Stripe Connect hosted onboarding in an in-app browser modal (not OAuth / not auth session).
 * Resolves when the user closes the modal; caller should reconcile payout status afterward.
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

  console.info('[stripe-connect] onboarding_url_ready', JSON.stringify(stripeUrlMeta(stripeUrl)));
  console.info('[stripe-connect] opening_in_app_browser');

  try {
    const result = await WebBrowser.openBrowserAsync(stripeUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      showInRecents: false,
      enableBarCollapsing: false,
    });
    console.info(
      '[stripe-connect] in_app_browser_closed',
      JSON.stringify({ type: result.type }),
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.info('[stripe-connect] in_app_browser_failed', JSON.stringify({ error }));
    throw new Error(`Could not open Stripe setup: ${error}`);
  }

  return 'closed';
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
