import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { WalletIncompleteError } from '../lib/buyerWalletErrors';

export function createLiveVariantPurchaseIdempotencyKey(variantId: string): string {
  const bucket = Math.floor(Date.now() / 30_000);
  return `lv_purchase_${variantId}_${bucket}`;
}

export type LiveVariantPurchaseResult =
  | { ok: true; paid: true; purchaseId?: string }
  | { ok: true; checkoutUrl: string; purchaseId?: string }
  | { ok: false; error: string; status: number; signInUrl?: string };

export async function purchaseLiveItemVariant(args: {
  accessToken: string;
  liveRoomId: string;
  itemId: string;
  variantId: string;
  quantity?: number;
  idempotencyKey?: string;
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
      body: JSON.stringify({ quantity: args.quantity ?? 1 }),
    },
  );

  let payload: {
    error?: string;
    checkoutUrl?: string;
    paid?: boolean;
    signInUrl?: string;
    purchaseId?: string;
    paymentReady?: boolean;
    shippingReady?: boolean;
    addPaymentMethodsUrl?: string;
    addShippingUrl?: string;
  } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    /* ignore */
  }

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
    };
  }
  if (payload.paid) {
    return { ok: true, paid: true, purchaseId: payload.purchaseId };
  }
  if (payload.checkoutUrl) {
    return { ok: true, checkoutUrl: payload.checkoutUrl, purchaseId: payload.purchaseId };
  }
  return { ok: false, error: 'Unexpected checkout response.', status: 500 };
}
