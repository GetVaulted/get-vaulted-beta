import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import { WalletIncompleteError } from '../lib/buyerWalletErrors';

/** Stripe charge + tax/shipping estimate can exceed the default 15s mobile abort, especially on Android. */
const VARIANT_PURCHASE_TIMEOUT_MS = 45_000;

export function createLiveVariantPurchaseIdempotencyKey(variantId: string): string {
  const bucket = Math.floor(Date.now() / 30_000);
  return `lv_purchase_${variantId}_${bucket}`;
}

export function createLiveVariantBatchPurchaseIdempotencyKey(variantIds: string[]): string {
  const bucket = Math.floor(Date.now() / 30_000);
  const sorted = [...variantIds].sort().join('_').slice(0, 80);
  return `lv_batch_${sorted}_${bucket}`;
}

export type LiveVariantPurchaseResult =
  | { ok: true; paid: true; purchaseId?: string; batchId?: string; purchaseIds?: string[]; labels?: string[] }
  | {
      ok: true;
      requiresAction: true;
      purchaseId: string;
      batchId?: string;
      clientSecret: string;
      paymentIntentId: string;
      publishableKey?: string;
    }
  | { ok: true; processing: true; purchaseId: string; batchId?: string; paymentIntentId: string }
  | {
      ok: false;
      error: string;
      status: number;
      signInUrl?: string;
      walletIncomplete?: boolean;
      paymentFailed?: boolean;
      code?: string;
      checkoutDebug?: { code?: string; fulfillmentDetail?: string | null };
    };

type PurchasePayload = {
  error?: string;
  paid?: boolean;
  purchaseId?: string;
  batchId?: string;
  purchaseIds?: string[];
  labels?: string[];
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
      checkoutDebug: payload.checkoutDebug,
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
    return {
      ok: true,
      paid: true,
      purchaseId: payload.purchaseId ?? payload.purchaseIds?.[0],
      batchId: payload.batchId,
      purchaseIds: payload.purchaseIds,
      labels: payload.labels,
    };
  }
  if (payload.requiresAction && payload.clientSecret && payload.paymentIntentId) {
    const purchaseId = payload.purchaseId ?? payload.purchaseIds?.[0];
    if (!purchaseId && !payload.batchId) {
      return { ok: false, error: 'Unexpected checkout response.', status: 500 };
    }
    return {
      ok: true,
      requiresAction: true,
      purchaseId: purchaseId ?? payload.batchId!,
      batchId: payload.batchId,
      clientSecret: payload.clientSecret,
      paymentIntentId: payload.paymentIntentId,
      publishableKey: payload.publishableKey,
    };
  }
  if (payload.processing && payload.paymentIntentId) {
    const purchaseId = payload.purchaseId ?? payload.purchaseIds?.[0];
    if (!purchaseId && !payload.batchId) {
      return { ok: false, error: 'Unexpected checkout response.', status: 500 };
    }
    return {
      ok: true,
      processing: true,
      purchaseId: purchaseId ?? payload.batchId!,
      batchId: payload.batchId,
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
    { timeoutMs: VARIANT_PURCHASE_TIMEOUT_MS },
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
    { timeoutMs: VARIANT_PURCHASE_TIMEOUT_MS },
  );

  let payload: PurchasePayload = {};
  try {
    payload = (await res.json()) as PurchasePayload;
  } catch {
    /* ignore */
  }

  return mapPurchaseResponse(res, payload);
}

export async function purchaseLiveItemVariantBatch(args: {
  accessToken: string;
  liveRoomId: string;
  itemId: string;
  variantIds: string[];
  idempotencyKey?: string;
  paymentMethodId?: string;
}): Promise<LiveVariantPurchaseResult> {
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/variants/batch-purchase`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key':
          args.idempotencyKey ?? createLiveVariantBatchPurchaseIdempotencyKey(args.variantIds),
      },
      body: JSON.stringify({
        variantIds: args.variantIds,
        paymentMethodId: args.paymentMethodId,
      }),
    },
    { timeoutMs: VARIANT_PURCHASE_TIMEOUT_MS },
  );

  let payload: PurchasePayload = {};
  try {
    payload = (await res.json()) as PurchasePayload;
  } catch {
    /* ignore */
  }

  return mapPurchaseResponse(res, payload);
}

export async function syncLiveItemVariantPurchaseBatch(args: {
  accessToken: string;
  liveRoomId: string;
  itemId: string;
  batchId: string;
}): Promise<LiveVariantPurchaseResult> {
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/variants/batch-purchase`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'sync', batchId: args.batchId }),
    },
    { timeoutMs: VARIANT_PURCHASE_TIMEOUT_MS },
  );

  let payload: PurchasePayload = {};
  try {
    payload = (await res.json()) as PurchasePayload;
  } catch {
    /* ignore */
  }

  return mapPurchaseResponse(res, payload);
}
