import type { BuyerWalletReadiness } from '../lib/buyerWalletErrors';
import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

export type BuyerPaymentMethodRow = {
  id: string;
  type?: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault?: boolean;
};

export type BuyerWalletCapabilities = {
  stripeConfigured: boolean;
  card: boolean;
  applePay: boolean;
  googlePay: boolean;
  link: boolean;
  cashAppPay: boolean;
  amazonPay: boolean;
  paypal: boolean;
  venmo: boolean;
};

export type BuyerWalletSummary = {
  paymentReady: boolean;
  shippingReady: boolean;
  walletReady: boolean;
  vaultCreditsUsd: number;
  /** Spendable now (past the return/dispute hold window). */
  referralCreditUsd: number;
  /** Earned but still inside the hold window — not yet spendable. */
  referralCreditPendingUsd?: number;
  /** Secret referral code used in `?ref=` on the join link (not the username). */
  referralCode?: string;
  /** Count of distinct friends who have earned this user a referrer credit (excludes voided). */
  referralSuccessfulReferrals?: number;
  promoCodeApplied: string | null;
  promoDiscountUsd: number;
  stripePublishableKey?: string | null;
  capabilities: BuyerWalletCapabilities;
  defaultPaymentMethod: BuyerPaymentMethodRow | null;
  paymentMethods: BuyerPaymentMethodRow[];
  defaultShippingAddressId: string | null;
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
  phone?: string | null;
  isDefault?: boolean;
};

export type BuyerSetupIntentPayload = {
  clientSecret: string;
  publishableKey: string;
  merchantCountryCode?: string;
  applePayEnabled?: boolean;
  googlePayEnabled?: boolean;
  linkEnabled?: boolean;
  cashAppPayEnabled?: boolean;
  amazonPayEnabled?: boolean;
  paypalEnabled?: boolean;
  venmoEnabled?: boolean;
  paymentMethodTypes?: string[];
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
  phone: string;
  isDefault?: boolean;
};

function requireApiBase(): string {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('API URL not configured.');
  return base;
}

/** Wallet readiness from GET /api/live-rooms/:id (same source as bid 402 gate). */
export async function fetchBuyerWalletReadiness(
  accessToken: string | undefined,
  roomId: string,
): Promise<BuyerWalletReadiness | null> {
  if (!roomId.trim() || !accessToken?.trim()) return null;
  requireApiBase();
  const res = await fetchWebApiAuthed(`/api/live-rooms/${encodeURIComponent(roomId)}`, accessToken);
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
  if (!getWebApiBaseUrl()) {
    return { paymentMethods: [], stripeConfigured: false, message: 'API URL not configured.' };
  }
  if (!accessToken?.trim()) {
    return { paymentMethods: [], stripeConfigured: true, message: 'Sign in to load payment methods.' };
  }
  const res = await fetchWebApiAuthed('/api/account/payment-methods', accessToken);
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
  requireApiBase();
  if (!accessToken?.trim()) throw new Error('Sign in to add a payment method.');
  // Stripe customer + SetupIntent can exceed the default 15s mobile timeout on cold API.
  const res = await fetchWebApiAuthed(
    '/api/account/payment-methods/setup-intent',
    accessToken,
    { method: 'POST' },
    { timeoutMs: 45_000 },
  );
  const j = (await res.json().catch(() => ({}))) as {
    clientSecret?: string;
    publishableKey?: string;
    merchantCountryCode?: string;
    applePayEnabled?: boolean;
    googlePayEnabled?: boolean;
    linkEnabled?: boolean;
    cashAppPayEnabled?: boolean;
    amazonPayEnabled?: boolean;
    paypalEnabled?: boolean;
    venmoEnabled?: boolean;
    paymentMethodTypes?: string[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' ? j.error : 'Could not start card setup.');
  }
  if (!j.clientSecret?.trim() || !j.publishableKey?.trim()) {
    throw new Error('Could not start card setup.');
  }
  return {
    clientSecret: j.clientSecret,
    publishableKey: j.publishableKey,
    merchantCountryCode: j.merchantCountryCode ?? 'US',
    applePayEnabled: j.applePayEnabled !== false,
    googlePayEnabled: j.googlePayEnabled !== false,
    linkEnabled: j.linkEnabled === true,
    cashAppPayEnabled: j.cashAppPayEnabled === true,
    amazonPayEnabled: j.amazonPayEnabled === true,
    paypalEnabled: j.paypalEnabled === true,
    venmoEnabled: j.venmoEnabled !== false,
    paymentMethodTypes: Array.isArray(j.paymentMethodTypes) ? j.paymentMethodTypes : ['card'],
  };
}

/**
 * Start Venmo linking. Backend should return `{ authorizeUrl }` when ready;
 * until then the route returns 501 VENMO_BACKEND_PENDING.
 */
export async function startBuyerVenmoSetup(accessToken: string | undefined): Promise<{
  authorizeUrl?: string;
  paymentMethodId?: string;
}> {
  requireApiBase();
  if (!accessToken?.trim()) throw new Error('Sign in to connect Venmo.');
  const res = await fetchWebApiAuthed('/api/account/payment-methods/venmo-setup', accessToken, {
    method: 'POST',
    body: '{}',
  });
  const j = (await res.json().catch(() => ({}))) as {
    authorizeUrl?: string;
    paymentMethodId?: string;
    error?: string;
    code?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof j.error === 'string' ? j.error : 'Venmo linking is not available yet.',
    );
  }
  return {
    authorizeUrl: typeof j.authorizeUrl === 'string' ? j.authorizeUrl : undefined,
    paymentMethodId: typeof j.paymentMethodId === 'string' ? j.paymentMethodId : undefined,
  };
}

export async function fetchBuyerWalletSummary(
  accessToken: string | undefined,
): Promise<BuyerWalletSummary | null> {
  if (!getWebApiBaseUrl() || !accessToken?.trim()) return null;
  const res = await fetchWebApiAuthed('/api/account/wallet', accessToken);
  const j = (await res.json().catch(() => ({}))) as { wallet?: BuyerWalletSummary; error?: string };
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' ? j.error : 'Could not load wallet.');
  }
  return j.wallet ?? null;
}

export async function setBuyerDefaultPaymentMethod(
  accessToken: string | undefined,
  paymentMethodId: string,
): Promise<void> {
  requireApiBase();
  if (!accessToken?.trim()) throw new Error('Sign in to update payment method.');
  const res = await fetchWebApiAuthed(
    `/api/account/payment-methods/${encodeURIComponent(paymentMethodId)}`,
    accessToken,
    { method: 'PATCH', body: JSON.stringify({ action: 'set_default' }) },
  );
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Could not set default.');
}

export async function deleteBuyerPaymentMethod(
  accessToken: string | undefined,
  paymentMethodId: string,
): Promise<void> {
  requireApiBase();
  if (!accessToken?.trim()) throw new Error('Sign in to remove payment method.');
  const res = await fetchWebApiAuthed(
    `/api/account/payment-methods/${encodeURIComponent(paymentMethodId)}`,
    accessToken,
    { method: 'DELETE' },
  );
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Could not remove payment method.');
}

export async function updateBuyerShippingAddress(
  accessToken: string | undefined,
  addressId: string,
  input: CreateShippingAddressInput,
): Promise<void> {
  requireApiBase();
  if (!accessToken?.trim()) throw new Error('Sign in to save your address.');
  const res = await fetchWebApiAuthed(
    `/api/account/addresses/${encodeURIComponent(addressId)}`,
    accessToken,
    {
      method: 'PATCH',
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
        phone: input.phone.trim(),
        isDefault: input.isDefault !== false,
      }),
    },
    { timeoutMs: 45_000 },
  );
  const j = (await res.json().catch(() => ({}))) as { error?: string; messages?: string[] };
  if (!res.ok) {
    const primary = typeof j.error === 'string' ? j.error : 'Could not update address.';
    const extra = Array.isArray(j.messages)
      ? j.messages.filter((m) => m.trim() && m.trim() !== primary)
      : [];
    throw new Error(extra.length ? `${primary}\n${extra.join('\n')}` : primary);
  }
}

export async function deleteBuyerShippingAddress(
  accessToken: string | undefined,
  addressId: string,
): Promise<void> {
  requireApiBase();
  if (!accessToken?.trim()) throw new Error('Sign in to remove address.');
  const res = await fetchWebApiAuthed(`/api/account/addresses/${encodeURIComponent(addressId)}`, accessToken, {
    method: 'DELETE',
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Could not remove address.');
}

/** Carries the HTTP status so the UI can show 401/400-specific recovery copy. */
export class FinalizePaymentMethodError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'FinalizePaymentMethodError';
    this.status = status;
  }
}

export async function finalizeBuyerPaymentMethodSetup(
  accessToken: string | undefined,
  args: { paymentMethodId?: string; setupIntentId?: string; clientSecret?: string },
): Promise<{ paymentMethodId: string; expMonth: number; expYear: number }> {
  const base = requireApiBase();
  if (!accessToken?.trim()) throw new Error('Sign in to save your payment method.');

  console.log('[wallet] finalize payment method request', {
    baseUrl: base,
    paymentMethodId: args.paymentMethodId ?? null,
    hasSetupIntentId: Boolean(args.setupIntentId),
    hasClientSecret: Boolean(args.clientSecret),
  });

  const res = await fetchWebApiAuthed(
    '/api/account/payment-methods/finalize',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(args),
    },
    { timeoutMs: 45_000 },
  );
  const j = (await res.json().catch(() => ({}))) as {
    paymentMethodId?: string;
    expMonth?: number;
    expYear?: number;
    error?: string;
  };

  console.log('[wallet] finalize payment method response', {
    status: res.status,
    body: j,
  });

  if (!res.ok) {
    throw new FinalizePaymentMethodError(
      typeof j.error === 'string' ? j.error : 'Could not finalize payment method.',
      res.status,
    );
  }
  if (!j.paymentMethodId?.trim()) {
    throw new FinalizePaymentMethodError('Card save did not return a payment method.', 400);
  }
  return {
    paymentMethodId: j.paymentMethodId,
    expMonth: typeof j.expMonth === 'number' ? j.expMonth : 0,
    expYear: typeof j.expYear === 'number' ? j.expYear : 0,
  };
}

export async function fetchBuyerShippingAddresses(
  accessToken: string | undefined,
): Promise<BuyerShippingAddressRow[]> {
  if (!getWebApiBaseUrl() || !accessToken?.trim()) return [];
  const res = await fetchWebApiAuthed('/api/account/addresses', accessToken);
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
  requireApiBase();
  if (!accessToken?.trim()) throw new Error('Sign in to save your address.');
  // Address create runs Shippo validation — allow longer than the default 15s.
  const res = await fetchWebApiAuthed(
    '/api/account/addresses',
    accessToken,
    {
      method: 'POST',
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
        phone: input.phone.trim(),
        isDefault: input.isDefault !== false,
        isVerified: false,
      }),
    },
    { timeoutMs: 45_000 },
  );
  const j = (await res.json().catch(() => ({}))) as { error?: string; messages?: string[] };
  if (!res.ok) {
    const primary = typeof j.error === 'string' ? j.error : 'Could not save address.';
    const extra = Array.isArray(j.messages)
      ? j.messages.filter((m) => m.trim() && m.trim() !== primary)
      : [];
    throw new Error(extra.length ? `${primary}\n${extra.join('\n')}` : primary);
  }
}
