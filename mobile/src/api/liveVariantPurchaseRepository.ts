import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
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
  requiresAction?: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  publishableKey?: string;
  processing?: boolean;
};

function mapPurchaseResponse(res: Response, payload: PurchasePayload): LiveVariantPurchaseResult {
  if (res.status === 402) {
    throw new WalletIncompleteError(payload);
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
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');

  const res = await fetch(
    `${base}/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/variants/${encodeURIComponent(args.variantId)}/purchase`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.accessToken}`,
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

  return mapPurchaseResponse(res, payload);
}

export async function syncLiveItemVariantPurchase(args: {
  accessToken: string;
  liveRoomId: string;
  itemId: string;
  variantId: string;
  purchaseId: string;
}): Promise<LiveVariantPurchaseResult> {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');

  const res = await fetch(
    `${base}/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/variants/${encodeURIComponent(args.variantId)}/purchase`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.accessToken}`,
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
