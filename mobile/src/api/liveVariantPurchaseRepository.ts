import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import { WalletIncompleteError } from '../lib/buyerWalletErrors';

export function createLiveVariantPurchaseIdempotencyKey(variantId: string): string {
  const bucket = Math.floor(Date.now() / 30_000);
  return `lv_purchase_${variantId}_${bucket}`;
}

export type LiveVariantPurchaseResult =
  | { ok: true; paid: true; purchaseId?: string }
  | {
      ok: true;
      requiresAction: true;
      purchaseId: string;
      clientSecret: string;
      paymentIntentId: string;
      publishableKey?: string;
    }
  | { ok: true; processing: true; purchaseId: string; paymentIntentId: string }
  | {
      ok: false;
      error: string;
      status: number;
      signInUrl?: string;
      walletIncomplete?: boolean;
      paymentFailed?: boolean;
      code?: string;
    };

type PurchasePayload = {
  error?: string;
  paid?: boolean;
  purchaseId?: string;
  signInUrl?: string;
  code?: string;
  paymentFailed?: boolean;
  paymentReady?: boolean;
  shippingReady?: boolean;
  addPaymentMethodsUrl?: string;
  addShippingUrl?: string;
  requiresAction?: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  publishableKey?: string;
  processing?: boolean;
  checkoutDebug?: { code?: string; fulfillmentDetail?: string | null };
};

function mapPurchaseResponse(res: Response, payload: PurchasePayload): LiveVariantPurchaseResult {
  if (res.status === 402 && payload.code === 'LIVE_BUYER_WALLET_INCOMPLETE') {
    throw new WalletIncompleteError(payload);
  }
  if (res.status === 402) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Payment failed.',
      status: 402,
      paymentFailed: payload.paymentFailed === true,
      code: payload.code,
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
      paymentFailed: payload.paymentFailed === true,
      code: payload.code,
    };
  }
  if (payload.paid) {
    return { ok: true, paid: true, purchaseId: payload.purchaseId };
  }
  if (payload.requiresAction && payload.clientSecret && payload.purchaseId && payload.paymentIntentId) {
    return {
      ok: true,
      requiresAction: true,
      purchaseId: payload.purchaseId,
      clientSecret: payload.clientSecret,
      paymentIntentId: payload.paymentIntentId,
      publishableKey: payload.publishableKey,
    };
  }
  if (payload.processing && payload.purchaseId && payload.paymentIntentId) {
    return {
      ok: true,
      processing: true,
      purchaseId: payload.purchaseId,
      paymentIntentId: payload.paymentIntentId,
    };
  }
  return { ok: false, error: 'Unexpected checkout response.', status: 500 };
}

export async function purchaseLiveItemVariant(args: {
  accessToken: string;
  liveRoomId: string;
  itemId: string;
  variantId: string;
  quantity?: number;
  idempotencyKey?: string;
  paymentMethodId?: string;
}): Promise<LiveVariantPurchaseResult> {
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/variants/${encodeURIComponent(args.variantId)}/purchase`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': args.idempotencyKey ?? createLiveVariantPurchaseIdempotencyKey(args.variantId),
      },
      body: JSON.stringify({
        quantity: args.quantity ?? 1,
        paymentMethodId: args.paymentMethodId,
      }),
    },
  );

  let payload: PurchasePayload = {};
  try {
    payload = (await res.json()) as PurchasePayload;
  } catch {
    /* ignore */
  }

  const result = mapPurchaseResponse(res, payload);
  if (!result.ok) {
    console.log('[variant purchase] failed', {
      status: result.status,
      code: result.code ?? payload.code ?? null,
      paymentFailed: result.paymentFailed ?? payload.paymentFailed ?? null,
      checkoutDebug: payload.checkoutDebug ?? null,
    });
  }
  return result;
}

export async function syncLiveItemVariantPurchase(args: {
  accessToken: string;
  liveRoomId: string;
  itemId: string;
  variantId: string;
  purchaseId: string;
}): Promise<LiveVariantPurchaseResult> {
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/variants/${encodeURIComponent(args.variantId)}/purchase`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'sync', purchaseId: args.purchaseId }),
    },
  );

  let payload: PurchasePayload = {};
  try {
    payload = (await res.json()) as PurchasePayload;
  } catch {
    /* ignore */
  }

  return mapPurchaseResponse(res, payload);
}
