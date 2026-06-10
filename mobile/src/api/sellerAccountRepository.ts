import type { SellerLiveReadiness } from './liveHostRepository';
import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type SellerAccountPayload = {
  username: string;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  name: string | null;
  image: string | null;
  shipFromName: string | null;
  shipFromStreet: string | null;
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromZip: string | null;
  shipFromCountry: string | null;
};

export type SellerAccountResponse = {
  setupWizardComplete?: boolean;
  sellerSetupWizardCompletedAt?: string | null;
  sellerAgreementAcceptedAt?: string | null;
  seller: SellerAccountPayload;
  stripePlatformConfigured?: boolean;
  readiness?: SellerLiveReadiness;
};

async function accountFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  return fetchWebApiAuthed(path, accessToken, init);
}

export async function fetchSellerAccount(accessToken: string): Promise<SellerAccountResponse> {
  const res = await accountFetch('/api/account/seller', accessToken);
  let j: SellerAccountResponse & { error?: string } = { seller: {} as SellerAccountPayload };
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' && j.error.trim() ? j.error.trim() : `Request failed (${res.status})`);
  }
  if (!j.seller) throw new Error('Seller settings unavailable.');
  return j;
}

export type PatchSellerShipFromInput = {
  shipFromName?: string;
  shipFromStreet: string;
  shipFromCity: string;
  shipFromState: string;
  shipFromZip: string;
  shipFromCountry: string;
};

export async function patchSellerShipFrom(
  accessToken: string,
  body: PatchSellerShipFromInput,
): Promise<{ message?: string; readiness?: SellerLiveReadiness; seller?: SellerAccountPayload }> {
  const res = await accountFetch('/api/account/seller', accessToken, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  let j: { error?: string; message?: string; readiness?: SellerLiveReadiness; seller?: SellerAccountPayload } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' && j.error.trim() ? j.error.trim() : `Request failed (${res.status})`);
  }
  return j;
}

export async function patchSellerProfile(
  accessToken: string,
  body: { name?: string; image?: string },
): Promise<{ user?: { name: string | null; image: string | null; username: string } }> {
  const res = await accountFetch('/api/account/profile', accessToken, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  let j: { error?: string; user?: { name: string | null; image: string | null; username: string } } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' && j.error.trim() ? j.error.trim() : `Request failed (${res.status})`);
  }
  return j;
}

export async function markSellerSetupWizardCompleteOnServer(
  accessToken: string,
  sellerAgreementAccepted = true,
): Promise<{ setupWizardComplete?: boolean }> {
  const res = await accountFetch('/api/account/seller/wizard-complete', accessToken, {
    method: 'POST',
    body: JSON.stringify({ sellerAgreementAccepted }),
  });
  let j: { error?: string; setupWizardComplete?: boolean } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' && j.error.trim() ? j.error.trim() : `Request failed (${res.status})`);
  }
  return j;
}
