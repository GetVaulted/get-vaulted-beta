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
  | 'pending_review'
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
  /** True when charges + payouts are enabled and requirements are clear. */
  payout_setup_complete?: boolean;
  /** True when hosted onboarding was submitted and nothing is currently due in Stripe. */
  payout_setup_submitted?: boolean;
};

/** True when Stripe Connect is fully cleared to sell and receive payouts. */
export function isSellerPayoutSetupComplete(status: SellerConnectStatusResponse | null | undefined): boolean {
  if (!status?.stripeConfigured) return false;
  return Boolean(status.can_publish_active_listings && status.payouts_ready);
}

/** Payout card badge: Not ready / Action required / Ready / Complete */
export function sellerConnectBadge(
  status: SellerConnectStatusResponse | null | undefined,
  options?: { fetchError?: string | null },
): string {
  if (!status) {
    return options?.fetchError ? 'Unavailable' : 'Not ready';
  }
  if (isSellerPayoutSetupComplete(status) || status.payout_setup_complete) return 'Complete';
  if (
    status.payout_setup_submitted ||
    status.payouts_ready ||
    status.onboarding_ui_status === 'verified' ||
    status.onboarding_ui_status === 'pending_review'
  ) {
    return 'Ready';
  }
  if (status.onboarding_ui_status === 'action_required' || status.onboarding_ui_status === 'restricted') {
    return 'Action required';
  }
  if (status.stripe_onboarding_complete) return 'Ready';
  if (status.stripe_account_id?.trim()) return 'Ready';
  return 'Not ready';
}

export function sellerConnectDetailMessage(
  status: SellerConnectStatusResponse | null | undefined,
  options?: { fetchError?: string | null },
): string {
  if (!status) {
    if (options?.fetchError?.trim()) return options.fetchError.trim();
    return 'Complete Stripe once to publish active listings and go live as a seller.';
  }
  if (!status.stripeConfigured) {
    return 'Stripe is not configured in this build — seller gates are relaxed for development.';
  }
  if (isSellerPayoutSetupComplete(status) || status.payout_setup_complete) {
    return status.message_payouts ?? 'Payout setup complete. You can publish listings and host live sales.';
  }
  if (
    status.payout_setup_submitted ||
    status.onboarding_ui_status === 'pending_review' ||
    status.onboarding_ui_status === 'verified'
  ) {
    return (
      status.message_payouts ??
      'Stripe is finishing your payout setup. Pull down to refresh — Ready usually appears within a few minutes.'
    );
  }
  if (status.message_onboarding?.trim()) return status.message_onboarding.trim();
  if (status.message_payouts?.trim()) return status.message_payouts.trim();
  return 'Complete Stripe once to publish active listings and go live as a seller.';
}

async function getAccessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export type SellerConnectFetchResult = {
  status: SellerConnectStatusResponse | null;
  error: string | null;
};

export async function fetchSellerConnectStatus(
  accessToken?: string | null,
): Promise<SellerConnectFetchResult> {
  const base = getWebApiBaseUrl();
  if (!base) {
    return {
      status: null,
      error: 'Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your deployed Next.js API host.',
    };
  }
  const token = accessToken ?? (await getAccessToken());
  if (!token) return { status: null, error: null };
  let res: Response;
  try {
    res = await fetchConnect(
      '/api/stripe/connect/status',
      {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      },
      base,
    );
  } catch (e) {
    return {
      status: null,
      error: e instanceof Error ? e.message : 'Could not load payout status.',
    };
  }
  if (!res.ok) {
    let message = `Payout status failed (${res.status}). Pull to refresh or sign in again.`;
    try {
      const j = (await res.json()) as { error?: string };
      if (typeof j.error === 'string' && j.error.trim()) message = j.error.trim();
    } catch {
      /* ignore */
    }
    return { status: null, error: message };
  }
  return { status: (await res.json()) as SellerConnectStatusResponse, error: null };
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
