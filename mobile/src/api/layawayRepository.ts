import { fetchWebApi } from './webListingsRepository';

export type LayawayRow = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImageUrl: string | null;
  planType: string;
  status: string;
  depositAmountUsd: number;
  amountPaidUsd: number;
  remainingBalanceUsd: number;
  dueAt: string;
  orderId: string;
};

export type SellerLayawayRow = {
  id: string;
  listingTitle: string;
  buyerUsername: string;
  status: string;
  amountPaidUsd: number;
  remainingBalanceUsd: number;
  dueAt: string;
};

export async function fetchBuyerLayaways(accessToken: string): Promise<LayawayRow[]> {
  const res = await fetchWebApi('/api/account/layaways', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => null)) as { layaways?: LayawayRow[] } | null;
  if (!res.ok) return [];
  return Array.isArray(body?.layaways) ? body.layaways : [];
}

export async function fetchSellerLayaways(
  accessToken: string,
  status?: 'active' | 'completed' | 'defaulted',
): Promise<SellerLayawayRow[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetchWebApi(`/api/account/sales/layaways${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => null)) as { layaways?: SellerLayawayRow[] } | null;
  if (!res.ok) return [];
  return Array.isArray(body?.layaways) ? body.layaways : [];
}

export async function startLayawayPayment(
  accessToken: string,
  layawayId: string,
  opts?: { amountUsd?: number; payRemaining?: boolean },
): Promise<string | null> {
  const res = await fetchWebApi(`/api/layaway/${encodeURIComponent(layawayId)}/pay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(opts ?? { payRemaining: true }),
  });
  const body = (await res.json().catch(() => null)) as { url?: string } | null;
  if (!res.ok) return null;
  return body?.url?.trim() ?? null;
}

export async function fetchBuyerLayawayStatus(accessToken: string): Promise<boolean> {
  const res = await fetchWebApi('/api/account/layaway-status', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => null)) as { hasActiveLayaway?: boolean } | null;
  if (!res.ok) return false;
  return body?.hasActiveLayaway === true;
}
