import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type OrderShipTo = {
  shipRecipientName: string | null;
  shipAddress: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipZip: string | null;
  shipCountry: string | null;
};

export type OrderShippingFromWalletState = {
  shipTo: OrderShipTo;
  canUpdateFromWallet: boolean;
  blockedReason: string | null;
};

export async function fetchOrderShippingFromWalletState(
  accessToken: string,
  orderId: string,
): Promise<OrderShippingFromWalletState | null> {
  const res = await fetchWebApiAuthed(
    `/api/orders/${encodeURIComponent(orderId)}/shipping-from-wallet`,
    accessToken,
  );
  const j = (await res.json().catch(() => ({}))) as Partial<OrderShippingFromWalletState> & {
    error?: string;
  };
  if (!res.ok || !j.shipTo) return null;
  return {
    shipTo: j.shipTo,
    canUpdateFromWallet: Boolean(j.canUpdateFromWallet),
    blockedReason: j.blockedReason ?? null,
  };
}

export async function applyOrderShippingFromWallet(
  accessToken: string,
  orderId: string,
): Promise<{ ok: true; updated: boolean; shipTo: OrderShipTo } | { ok: false; error: string }> {
  const res = await fetchWebApiAuthed(
    `/api/orders/${encodeURIComponent(orderId)}/shipping-from-wallet`,
    accessToken,
    { method: 'POST' },
  );
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    updated?: boolean;
    shipTo?: OrderShipTo;
    error?: string;
  };
  if (!res.ok || !j.shipTo) {
    return { ok: false, error: typeof j.error === 'string' ? j.error : 'Could not update shipping address.' };
  }
  return { ok: true, updated: Boolean(j.updated), shipTo: j.shipTo };
}
