import { apiFailureErrorMessage } from '../lib/betaApiResponse';
import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import { supabaseJwtSub } from '../lib/logVaultCommandCenterFlow';
import { buildWebApiUrl, misconfiguredWebApiHostWarning } from '../lib/webApiBaseUrl';
import {
  parseWebApiJsonBody,
  readWebApiResponseText,
  responseLooksHtml,
  webApiFailureLogFields,
} from '../lib/webApiResponse';

export type LayawayRow = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImageUrl: string | null;
  planType: string;
  status: string;
  orderPaymentStatus?: string;
  displayStatus?: string;
  canMakePayment?: boolean;
  statusMessage?: string | null;
  depositAmountUsd: number;
  amountPaidUsd: number;
  remainingBalanceUsd: number;
  dueAt: string;
  orderId: string;
};

export type SellerLayawayCounts = {
  active: number;
  readyToShip: number;
  overdueOrDefaulted: number;
};

export type SellerLayawayRow = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImageUrl: string | null;
  buyerId: string;
  buyerUsername: string;
  planType: string;
  status: string;
  displayStatus: string;
  depositAmountUsd: number;
  amountPaidUsd: number;
  remainingBalanceUsd: number;
  startedAt: string;
  createdAt: string;
  dueAt: string;
  orderId: string;
};

export type SellerLayawayPaymentRow = {
  id: string;
  amountUsd: number;
  kind: string;
  paidAt: string;
};

export type SellerLayawayDetail = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImageUrl: string | null;
  listingPriceUsd: number;
  listingStatus: string;
  buyerId: string;
  buyerUsername: string;
  planType: string;
  status: string;
  displayStatus: string;
  originalPriceUsd: number;
  shippingPriceUsd: number;
  depositAmountUsd: number;
  amountPaidUsd: number;
  remainingBalanceUsd: number;
  startedAt: string;
  createdAt: string;
  dueAt: string;
  completedAt: string | null;
  defaultedAt: string | null;
  orderId: string;
  orderStatus: string;
  orderPaymentStatus: string;
  payments: SellerLayawayPaymentRow[];
};

export async function fetchBuyerLayaways(accessToken: string): Promise<LayawayRow[]> {
  const res = await fetchWebApiAuthed('/api/account/layaways', accessToken);
  const body = (await res.json().catch(() => null)) as { layaways?: LayawayRow[] } | null;
  if (!res.ok) return [];
  return Array.isArray(body?.layaways) ? body.layaways : [];
}

export async function fetchSellerLayaways(
  accessToken: string,
  status?: 'active' | 'completed' | 'defaulted',
): Promise<{ counts: SellerLayawayCounts; layaways: SellerLayawayRow[] }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const apiPath = `/api/account/sales/layaways${qs}`;
  const { base, url } = buildWebApiUrl(apiPath);
  const hostWarning = misconfiguredWebApiHostWarning(base);

  console.info('[fetchSellerLayaways] request', {
    url,
    path: apiPath,
    base,
    envSiteUrl: process.env.EXPO_PUBLIC_SITE_URL ?? null,
    envWebApiUrl: process.env.EXPO_PUBLIC_WEB_API_URL ?? null,
    authSource: 'fetchWebApiAuthed',
    hostWarning,
  });

  const res = await fetchWebApiAuthed(apiPath, accessToken);
  const rawText = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{
    counts?: SellerLayawayCounts;
    layaways?: SellerLayawayRow[];
    error?: string;
    code?: string;
  }>(rawText);

  const htmlResponse = responseLooksHtml(res.headers.get('content-type'), rawText);
  if (!res.ok || (htmlResponse && !body)) {
    const bodyPreview = rawText.slice(0, 120);
    console.warn('[fetchSellerLayaways] failed', {
      ...webApiFailureLogFields(res, { url, bodyPreview }),
      path: apiPath,
      error: body?.error ?? null,
      code: body?.code ?? null,
      authSource: 'fetchWebApiAuthed',
      sessionSub: supabaseJwtSub(accessToken),
      hostWarning,
    });
    throw new Error(apiFailureErrorMessage(res, body?.error, bodyPreview));
  }

  return {
    counts: body?.counts ?? { active: 0, readyToShip: 0, overdueOrDefaulted: 0 },
    layaways: Array.isArray(body?.layaways) ? body.layaways : [],
  };
}

export async function fetchSellerLayawayDetail(
  accessToken: string,
  layawayId: string,
): Promise<SellerLayawayDetail | null> {
  const apiPath = `/api/account/sales/layaways/${encodeURIComponent(layawayId)}`;
  const { url } = buildWebApiUrl(apiPath);
  const res = await fetchWebApiAuthed(apiPath, accessToken);
  const rawText = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{ layaway?: SellerLayawayDetail; error?: string }>(rawText);
  if (!res.ok || !body?.layaway) {
    if (!res.ok) {
      const bodyPreview = rawText.slice(0, 120);
      console.warn('[fetchSellerLayawayDetail]', {
        ...webApiFailureLogFields(res, { url, bodyPreview }),
        path: apiPath,
        error: body?.error ?? null,
        authSource: 'fetchWebApiAuthed',
        sessionSub: supabaseJwtSub(accessToken),
      });
    }
    return null;
  }
  return body.layaway;
}

export async function startLayawayPayment(
  accessToken: string,
  layawayId: string,
  opts?: { amountUsd?: number; payRemaining?: boolean },
): Promise<string | null> {
  const res = await fetchWebApiAuthed(`/api/layaway/${encodeURIComponent(layawayId)}/pay`, accessToken, {
    method: 'POST',
    body: JSON.stringify(opts ?? { payRemaining: true }),
  });
  const body = (await res.json().catch(() => null)) as { url?: string } | null;
  if (!res.ok) return null;
  return body?.url?.trim() ?? null;
}

export async function fetchBuyerLayawayStatus(accessToken: string): Promise<boolean> {
  const res = await fetchWebApiAuthed('/api/account/layaway-status', accessToken);
  const body = (await res.json().catch(() => null)) as { hasActiveLayaway?: boolean } | null;
  if (!res.ok) return false;
  return body?.hasActiveLayaway === true;
}
