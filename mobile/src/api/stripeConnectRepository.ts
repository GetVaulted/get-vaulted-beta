import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { getSupabase } from '../lib/supabase';

function connectNetworkFailureMessage(base: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const looksLikeTransport =
    msg === 'Network request failed' ||
    msg.includes('Network request failed') ||
    msg === 'Failed to fetch' ||
    err instanceof TypeError;
  const loopback = /localhost|127\.0\.0\.1|\[::1\]/i.test(base);
  const lines = [
    looksLikeTransport
      ? 'Could not reach the Vaulted API (connection failed before any response).'
      : `Request error: ${msg}`,
    `API base in this build: ${base}`,
    loopback
      ? 'You are using localhost. On a real phone that is the phone itself, not your computer. Set EXPO_PUBLIC_SITE_URL (or EXPO_PUBLIC_WEB_API_URL) to your deployed https site, or use your dev machine LAN IP with http only if your platform allows cleartext.'
      : 'Check EXPO_PUBLIC_SITE_URL / EXPO_PUBLIC_WEB_API_URL, VPN, and that the site is reachable in the device browser. Rebuild the app after changing env (Expo bakes EXPO_PUBLIC_* at bundle time).',
  ];
  return lines.join(' ');
}

async function fetchConnect(path: string, init: RequestInit, base: string): Promise<Response> {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    return await fetch(url, init);
  } catch (e) {
    throw new Error(connectNetworkFailureMessage(base, e));
  }
}

export type SellerConnectOnboardingUiStatus =
  | 'not_started'
  | 'in_progress'
  | 'action_required'
  | 'verified'
  | 'restricted';

export type SellerConnectStatusResponse = {
  stripeConfigured: boolean;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  stripe_requirements_due: {
    currentlyDue: string[];
    pendingVerification: string[];
    eventuallyDue: string[];
    disabledReason: string | null;
  } | null;
  stripe_verification_status: string | null;
  onboarding_ui_status: SellerConnectOnboardingUiStatus;
  can_publish_active_listings: boolean;
  can_host_live_sales: boolean;
  payouts_ready: boolean;
  message_onboarding: string | null;
  message_payouts: string | null;
};

/** Payout card badge: Not ready / Action required / Ready */
export function sellerConnectBadge(status: SellerConnectOnboardingUiStatus, payoutsReady: boolean): string {
  if (status === 'verified' && payoutsReady) return 'Ready';
  if (status === 'action_required' || status === 'restricted') return 'Action required';
  return 'Not ready';
}

async function getAccessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchSellerConnectStatus(accessToken?: string | null): Promise<SellerConnectStatusResponse | null> {
  const base = getWebApiBaseUrl();
  if (!base) return null;
  const token = accessToken ?? (await getAccessToken());
  if (!token) return null;
  const res = await fetch(`${base}/api/stripe/connect/status`, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as SellerConnectStatusResponse;
}

export async function createSellerOnboardingLink(accessToken?: string | null): Promise<{ url: string }> {
  const base = getWebApiBaseUrl();
  if (!base) {
    throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  }
  const token = accessToken ?? (await getAccessToken());
  if (!token) {
    throw new Error('You need to be signed in to set up payouts.');
  }
  const res = await fetchConnect(
    '/api/stripe/connect/create-onboarding-link',
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    },
    base,
  );
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (typeof j.error === 'string' && j.error.trim()) message = j.error.trim();
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const j = (await res.json()) as { url?: string };
  if (!j.url) {
    throw new Error('Server did not return an onboarding URL.');
  }
  return { url: j.url };
}
