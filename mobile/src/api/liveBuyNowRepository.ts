import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

export type LiveBuyNowPurchaseResult =
  | { ok: true; paid: true; orderId?: string }
  | {
      ok: true;
      requiresAction: true;
      orderId: string;
      clientSecret: string;
      paymentIntentId: string;
      publishableKey?: string;
    }
  | { ok: true; processing: true; orderId: string }
  | {
      ok: false;
      error: string;
      status: number;
      signInUrl?: string;
      walletIncomplete?: boolean;
      paymentFailed?: boolean;
      code?: string;
      orderId?: string;
    };

type BuyPayload = {
  error?: string;
  paid?: boolean;
  ok?: boolean;
  orderId?: string;
  signInUrl?: string;
  code?: string;
  paymentFailed?: boolean;
  requiresAction?: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  publishableKey?: string;
  processing?: boolean;
};

function mapBuyNowResponse(res: Response, payload: BuyPayload): LiveBuyNowPurchaseResult {
  if (res.status === 402 && payload.code === 'LIVE_BUYER_WALLET_INCOMPLETE') {
    return {
      ok: false,
      error: payload.error ?? 'Wallet incomplete.',
      status: 402,
      walletIncomplete: true,
    };
  }
  if (res.status === 402) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Payment failed.',
      status: 402,
      paymentFailed: payload.paymentFailed === true,
      code: payload.code,
      orderId: payload.orderId,
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Sign in required.',
      status: 401,
      signInUrl: payload.signInUrl,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Purchase failed.',
      status: res.status,
      signInUrl: payload.signInUrl,
    };
  }
  if (payload.paid || payload.ok) {
    return { ok: true, paid: true, orderId: payload.orderId };
  }
  if (payload.requiresAction && payload.clientSecret && payload.orderId && payload.paymentIntentId) {
    return {
      ok: true,
      requiresAction: true,
      orderId: payload.orderId,
      clientSecret: payload.clientSecret,
      paymentIntentId: payload.paymentIntentId,
      publishableKey: payload.publishableKey,
    };
  }
  if (payload.processing && payload.orderId) {
    return { ok: true, processing: true, orderId: payload.orderId };
  }
  return { ok: false, error: 'Purchase could not complete.', status: res.status };
}

export async function purchaseLiveBuyNow(args: {
  accessToken: string;
  liveRoomId: string;
  itemId: string;
  paymentMethodId?: string;
}): Promise<LiveBuyNowPurchaseResult> {
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/buy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentMethodId: args.paymentMethodId }),
    },
  );

  let payload: BuyPayload = {};
  try {
    payload = (await res.json()) as BuyPayload;
  } catch {
    /* ignore */
  }

  return mapBuyNowResponse(res, payload);
}

export async function syncLiveBuyNowPurchase(args: {
  accessToken: string;
  liveRoomId: string;
  itemId: string;
  orderId: string;
}): Promise<LiveBuyNowPurchaseResult> {
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/buy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'sync', orderId: args.orderId }),
    },
  );

  let payload: BuyPayload = {};
  try {
    payload = (await res.json()) as BuyPayload;
  } catch {
    /* ignore */
  }

  return mapBuyNowResponse(res, payload);
}
