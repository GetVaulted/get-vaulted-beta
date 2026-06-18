import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

export type LiveBuyerPaymentSession = {
  liveRoomPaymentReady: boolean;
  paymentReady: boolean;
  shippingReady: boolean;
  activePaymentMethodId: string | null;
  preauthorizationStatus: 'none' | 'wallet_ready' | 'authorized';
};

export async function fetchLiveBuyerPaymentSession(
  accessToken: string,
  liveRoomId: string,
): Promise<LiveBuyerPaymentSession | null> {
  if (!getWebApiBaseUrl() || !accessToken.trim() || !liveRoomId.trim()) return null;
  const res = await fetchWebApiAuthed(
    `/api/live-rooms/${encodeURIComponent(liveRoomId)}/buyer-payment`,
    accessToken,
  );
  const j = (await res.json().catch(() => ({}))) as { payment?: LiveBuyerPaymentSession; error?: string };
  if (!res.ok) return null;
  return j.payment ?? null;
}

export async function setLiveBuyerPaymentMethod(
  accessToken: string,
  liveRoomId: string,
  paymentMethodId: string,
): Promise<LiveBuyerPaymentSession | null> {
  if (!getWebApiBaseUrl() || !accessToken.trim() || !liveRoomId.trim()) return null;
  const res = await fetchWebApiAuthed(
    `/api/live-rooms/${encodeURIComponent(liveRoomId)}/buyer-payment`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ paymentMethodId }),
    },
  );
  const j = (await res.json().catch(() => ({}))) as { payment?: LiveBuyerPaymentSession; error?: string };
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' ? j.error : 'Could not update payment method.');
  }
  return j.payment ?? null;
}
