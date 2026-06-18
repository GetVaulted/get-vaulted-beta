import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type OrderRefundRequestRow = {
  id: string;
  orderId: string;
  kind: 'cancel' | 'return';
  status: string;
  reason: string;
  photoUrls: string[];
  sellerDenyReason: string | null;
  supportNote: string | null;
  returnTrackingNumber: string | null;
  returnCarrier: string | null;
  sellerDirect: boolean;
  escalatedAt: string | null;
  sellerRespondedAt: string | null;
  supportResolvedAt: string | null;
  returnReceivedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderRefundRequestState = {
  eligibility: { kind: 'cancel' | 'return' | null; blockedReason: string | null };
  request: OrderRefundRequestRow | null;
  liveShowId: string | null;
  role: 'buyer' | 'seller';
};

export async function fetchOrderRefundRequestState(
  accessToken: string,
  orderId: string,
): Promise<OrderRefundRequestState | null> {
  const res = await fetchWebApiAuthed(
    `/api/orders/${encodeURIComponent(orderId)}/refund-request`,
    accessToken,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`refund_request_fetch_${res.status}`);
  return (await res.json()) as OrderRefundRequestState;
}

export async function createOrderRefundRequest(
  accessToken: string,
  orderId: string,
  body: { kind: 'cancel' | 'return'; reason: string; photoUrls?: string[] },
): Promise<OrderRefundRequestRow> {
  const res = await fetchWebApiAuthed(`/api/orders/${encodeURIComponent(orderId)}/refund-request`, accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const j = (await res.json()) as { error?: string; request?: OrderRefundRequestRow };
  if (!res.ok) throw new Error(j.error ?? 'REQUEST_FAILED');
  if (!j.request) throw new Error('REQUEST_FAILED');
  return j.request;
}

export async function patchOrderRefundRequest(
  accessToken: string,
  orderId: string,
  body: Record<string, unknown>,
): Promise<OrderRefundRequestRow> {
  const res = await fetchWebApiAuthed(`/api/orders/${encodeURIComponent(orderId)}/refund-request`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const j = (await res.json()) as { error?: string; request?: OrderRefundRequestRow };
  if (!res.ok) throw new Error(j.error ?? 'PATCH_FAILED');
  if (!j.request) throw new Error('PATCH_FAILED');
  return j.request;
}
