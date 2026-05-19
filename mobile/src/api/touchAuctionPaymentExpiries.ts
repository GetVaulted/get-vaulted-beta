import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

/**
 * Triggers lazy `processAuctionPaymentExpiries` on the API (via GET /api/account/orders).
 * No-op when unauthenticated or API host unset.
 */
export async function touchAuctionPaymentExpiries(accessToken: string | undefined): Promise<void> {
  if (!accessToken?.trim()) return;
  const base = getWebApiBaseUrl();
  if (!base) return;
  try {
    await fetch(`${base}/api/account/orders`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    /* best-effort — expiry sweep must not block UI */
  }
}
