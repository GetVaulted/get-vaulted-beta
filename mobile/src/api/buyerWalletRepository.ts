import type { BuyerWalletReadiness } from '../lib/buyerWalletErrors';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

export type BuyerPaymentMethodRow = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export type BuyerShippingAddressRow = {
  id: string;
  type?: string;
  name: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault?: boolean;
};

export type BuyerSetupIntentPayload = {
  clientSecret: string;
  publishableKey: string;
};

export type CreateShippingAddressInput = {
  name: string;
  fullName: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault?: boolean;
};

function accountHeaders(accessToken: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (accessToken?.trim()) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

function apiBase(): string | null {
  return getWebApiBaseUrl();
}

/** Wallet readiness from GET /api/live-rooms/:id (same source as bid 402 gate). */
export async function fetchBuyerWalletReadiness(
  accessToken: string | undefined,
  roomId: string,
): Promise<BuyerWalletReadiness | null> {
  const base = apiBase();
  if (!base || !roomId.trim()) return null;
  const res = await fetch(`${base}/api/live-rooms/${encodeURIComponent(roomId)}`, {
    headers: accountHeaders(accessToken),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    room?: {
      buyerLiveBidPaymentReady?: boolean;
      buyerLiveShippingReady?: boolean;
    };
  };
  const room = j.room;
  if (!room) return null;
  return {
    paymentReady: room.buyerLiveBidPaymentReady !== false,
    shippingReady: room.buyerLiveShippingReady !== false,
  };
}

export async function fetchBuyerPaymentMethods(
  accessToken: string | undefined,
): Promise<{ paymentMethods: BuyerPaymentMethodRow[]; stripeConfigured: boolean; message?: string }> {
  const base = apiBase();
  if (!base) return { paymentMethods: [], stripeConfigured: false, message: 'API URL not configured.' };
  const res = await fetch(`${base}/api/account/payment-methods`, { headers: accountHeaders(accessToken) });
  const j = (await res.json().catch(() => ({}))) as {
    paymentMethods?: BuyerPaymentMethodRow[];
    stripeConfigured?: boolean;
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' ? j.error : 'Could not load payment methods.');
  }
  return {
    paymentMethods: Array.isArray(j.paymentMethods) ? j.paymentMethods : [],
    stripeConfigured: j.stripeConfigured !== false,
    message: typeof j.message === 'string' ? j.message : undefined,
  };
}

export async function createBuyerSetupIntent(
  accessToken: string | undefined,
): Promise<BuyerSetupIntentPayload> {
  const base = apiBase();
  if (!base) throw new Error('API URL not configured.');
  const res = await fetch(`${base}/api/account/payment-methods/setup-intent`, {
    method: 'POST',
    headers: accountHeaders(accessToken),
  });
  const j = (await res.json().catch(() => ({}))) as {
    clientSecret?: string;
    publishableKey?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' ? j.error : 'Could not start card setup.');
  }
  if (!j.clientSecret?.trim() || !j.publishableKey?.trim()) {
    throw new Error('Could not start card setup.');
  }
  return { clientSecret: j.clientSecret, publishableKey: j.publishableKey };
}

export async function fetchBuyerShippingAddresses(
  accessToken: string | undefined,
): Promise<BuyerShippingAddressRow[]> {
  const base = apiBase();
  if (!base) return [];
  const res = await fetch(`${base}/api/account/addresses`, { headers: accountHeaders(accessToken) });
  const j = (await res.json().catch(() => ({}))) as { addresses?: BuyerShippingAddressRow[]; error?: string };
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' ? j.error : 'Could not load addresses.');
  }
  const list = Array.isArray(j.addresses) ? j.addresses : [];
  return list.filter((a) => a.type === 'shipping');
}

export async function createBuyerShippingAddress(
  accessToken: string | undefined,
  input: CreateShippingAddressInput,
): Promise<void> {
  const base = apiBase();
  if (!base) throw new Error('API URL not configured.');
  const res = await fetch(`${base}/api/account/addresses`, {
    method: 'POST',
    headers: accountHeaders(accessToken),
    body: JSON.stringify({
      type: 'shipping',
      name: input.name.trim(),
      fullName: input.fullName.trim(),
      line1: input.line1.trim(),
      line2: input.line2?.trim() ? input.line2.trim() : null,
      city: input.city.trim(),
      state: input.state.trim(),
      postalCode: input.postalCode.trim(),
      country: input.country.trim().toUpperCase().slice(0, 2) || 'US',
      isDefault: input.isDefault !== false,
      isVerified: false,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' ? j.error : 'Could not save address.');
  }
}
