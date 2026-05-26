import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import type { BuyerWalletReadiness } from '../lib/buyerWalletErrors';

/** Wallet readiness from GET /api/live-rooms/:id (same source as bid 402 gate). */
export async function fetchBuyerWalletReadiness(
  accessToken: string | undefined,
  roomId: string,
): Promise<BuyerWalletReadiness | null> {
  const base = getWebApiBaseUrl();
  if (!base || !roomId.trim()) return null;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken?.trim()) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${base}/api/live-rooms/${encodeURIComponent(roomId)}`, { headers });
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
