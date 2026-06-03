import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';
import {
  createSellerOnboardingLink,
  type SellerConnectStatusResponse,
} from '../api/stripeConnectRepository';
import { getWebApiBaseUrl } from './webApiBaseUrl';

export type StripeConnectOnboardingResult =
  | 'success'
  | 'cancel'
  | 'opened_external'
  | 'dismiss';

const AUTH_SESSION_MIN_MS = 1200;

function logStripeOpen(message: string, data?: Record<string, unknown>): void {
  console.info('[stripe-connect]', message, data ? JSON.stringify(data) : '');
}

/** Must match Next.js `return_url` / `refresh_url` in create-onboarding-link (path prefix). */
export function getStripeConnectReturnUrlPrefix(): string | null {
  const base = getWebApiBaseUrl();
  if (!base) return null;
  return `${base}/mobile/stripe-connect-return`;
}

async function openStripeUrlWithLinking(stripeUrl: string): Promise<boolean> {
  try {
    const canOpen = await Linking.canOpenURL(stripeUrl);
    if (!canOpen) {
      logStripeOpen('Linking.canOpenURL returned false', { stripeUrl: stripeUrl.slice(0, 96) });
      return false;
    }
    await Linking.openURL(stripeUrl);
    return true;
  } catch (e) {
    logStripeOpen('Linking.openURL failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

async function openStripeUrlWithBrowser(stripeUrl: string): Promise<boolean> {
  try {
    await WebBrowser.openBrowserAsync(stripeUrl, {
      showInRecents: false,
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
    return true;
  } catch (e) {
    logStripeOpen('openBrowserAsync failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

async function openStripeUrlExternal(stripeUrl: string): Promise<void> {
  if (await openStripeUrlWithLinking(stripeUrl)) return;
  if (await openStripeUrlWithBrowser(stripeUrl)) return;
  throw new Error('Could not open Stripe on this device. Check your browser or try again.');
}

/**
 * Opens Stripe Connect hosted onboarding in an in-app auth session (Safari VC / Chrome Custom Tab).
 * Falls back to Linking / in-app browser when the auth session cannot start.
 */
export async function openStripeConnectOnboarding(
  accessToken: string,
  opts?: { refreshDepth?: number },
): Promise<StripeConnectOnboardingResult> {
  const refreshDepth = opts?.refreshDepth ?? 0;
  const returnUrl = getStripeConnectReturnUrlPrefix();
  if (!returnUrl) {
    throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  }

  const { url: stripeUrl } = await createSellerOnboardingLink(accessToken);
  if (!stripeUrl?.startsWith('http')) {
    throw new Error('Server did not return a valid Stripe onboarding URL.');
  }

  logStripeOpen('onboarding_url_ready', {
    returnUrl,
    stripeUrlPrefix: stripeUrl.slice(0, 72),
    stripeHost: (() => {
      try {
        return new URL(stripeUrl).host;
      } catch {
        return 'invalid';
      }
    })(),
  });

  try {
    WebBrowser.dismissAuthSession();
  } catch {
    /* no active session */
  }

  const startedAt = Date.now();
  let authResult: WebBrowser.WebBrowserAuthSessionResult;
  try {
    authResult = await WebBrowser.openAuthSessionAsync(stripeUrl, returnUrl, {
      showInRecents: false,
      preferEphemeralSession: false,
    });
  } catch (e) {
    logStripeOpen('openAuthSessionAsync threw', {
      error: e instanceof Error ? e.message : String(e),
    });
    await openStripeUrlExternal(stripeUrl);
    return 'opened_external';
  }

  const elapsedMs = Date.now() - startedAt;
  logStripeOpen('auth_session_finished', { type: authResult.type, elapsedMs });

  if (authResult.type === 'success') {
    const redirectUrl = 'url' in authResult && typeof authResult.url === 'string' ? authResult.url : '';
    if (elapsedMs < AUTH_SESSION_MIN_MS) {
      logStripeOpen('auth_session_success_too_fast_retry_external', { elapsedMs, redirectUrl });
      await openStripeUrlExternal(stripeUrl);
      return 'opened_external';
    }
    if (redirectUrl.includes('refresh=1')) {
      if (refreshDepth >= 1) return 'dismiss';
      logStripeOpen('refresh_redirect_reopening');
      return openStripeConnectOnboarding(accessToken, { refreshDepth: refreshDepth + 1 });
    }
    return 'success';
  }

  if (authResult.type === 'cancel') {
    return 'cancel';
  }

  logStripeOpen('auth_session_dismiss_fallback', { elapsedMs });
  await openStripeUrlExternal(stripeUrl);
  return 'opened_external';
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
