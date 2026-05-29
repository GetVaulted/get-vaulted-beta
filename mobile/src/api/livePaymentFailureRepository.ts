import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { mapLivePaymentFailureMessage } from '../lib/livePaymentFailureCopy';
import type { LiveBuyerPaymentFailureSnapshot } from './liveRoomBuyerRepository';

export type LivePaymentRetryResult =
  | { ok: true; paid: true; message?: string }
  | { ok: true; requiresAction: true; clientSecret: string; publishableKey?: string }
  | { ok: true; processing: true }
  | { ok: false; error: string; code?: string; status?: number; paymentFailure?: LiveBuyerPaymentFailureSnapshot | null };

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function retryLivePaymentFailure(args: {
  accessToken: string;
  roomId: string;
  failureId: string;
  action?: 'sync';
}): Promise<LivePaymentRetryResult> {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  const res = await fetch(`${base}/api/live-rooms/${encodeURIComponent(args.roomId)}/payment-failure/retry`, {
    method: 'POST',
    headers: authHeaders(args.accessToken),
    body: JSON.stringify({ failureId: args.failureId, action: args.action }),
  });
  let payload: {
    error?: string;
    code?: string;
    paid?: boolean;
    ok?: boolean;
    message?: string;
    requiresAction?: boolean;
    clientSecret?: string;
    publishableKey?: string;
    processing?: boolean;
    paymentFailure?: unknown;
  } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    /* ignore */
  }
  if (res.ok && (payload.paid || payload.ok)) {
    return { ok: true, paid: true, message: payload.message };
  }
  if (payload.requiresAction && payload.clientSecret) {
    return {
      ok: true,
      requiresAction: true,
      clientSecret: payload.clientSecret,
      publishableKey: payload.publishableKey,
    };
  }
  if (payload.processing) {
    return { ok: true, processing: true };
  }
  const code = typeof payload.code === 'string' ? payload.code : undefined;
  return {
    ok: false,
    // Map once here (with the server code) so the modal can render it directly without re-mapping.
    error: mapLivePaymentFailureMessage(typeof payload.error === 'string' ? payload.error : null, code),
    code,
    status: res.status,
    paymentFailure: parseFailure(payload.paymentFailure),
  };
}

function parseFailure(raw: unknown): LiveBuyerPaymentFailureSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : '';
  if (!id) return null;
  return {
    id,
    kind: typeof o.kind === 'string' ? o.kind : 'auction_win',
    liveRoomItemId: typeof o.liveRoomItemId === 'string' ? o.liveRoomItemId : null,
    orderId: typeof o.orderId === 'string' ? o.orderId : null,
    variantPurchaseId: typeof o.variantPurchaseId === 'string' ? o.variantPurchaseId : null,
    breakSpotId: typeof o.breakSpotId === 'string' ? o.breakSpotId : null,
    amountUsd: typeof o.amountUsd === 'number' ? o.amountUsd : 0,
    status: o.status === 'recovery_pending' ? 'recovery_pending' : 'payment_failed',
    failureReason: typeof o.failureReason === 'string' ? o.failureReason : null,
    failedAt: typeof o.failedAt === 'string' ? o.failedAt : new Date().toISOString(),
    itemTitle: typeof o.itemTitle === 'string' ? o.itemTitle : null,
    buyerUsername: typeof o.buyerUsername === 'string' ? o.buyerUsername : null,
  };
}
