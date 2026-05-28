/** Client idempotency keys for live variant checkout. */

export function createLiveVariantPurchaseIdempotencyKey(variantId: string): string {
  const bucket = Math.floor(Date.now() / 30_000);
  return `lv_purchase_${variantId}_${bucket}`;
}

export type LiveVariantPurchaseClientResult =
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
  | { ok: false; error: string; status: number; signInUrl?: string; walletIncomplete?: boolean; paymentFailed?: boolean; code?: string };

export async function purchaseLiveItemVariant(args: {
  liveRoomId: string;
  itemId: string;
  variantId: string;
  quantity?: number;
  idempotencyKey?: string;
  paymentMethodId?: string;
}): Promise<LiveVariantPurchaseClientResult> {
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/variants/${encodeURIComponent(args.variantId)}/purchase`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": args.idempotencyKey ?? createLiveVariantPurchaseIdempotencyKey(args.variantId),
      },
      credentials: "include",
      body: JSON.stringify({
        quantity: args.quantity ?? 1,
        paymentMethodId: args.paymentMethodId,
      }),
    },
  );
  const payload = (await res.json()) as {
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
  if (res.status === 402) {
    return { ok: false, error: payload.error ?? "Wallet incomplete.", status: 402, walletIncomplete: true };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: typeof payload.error === "string" ? payload.error : "Purchase failed.",
      status: res.status,
      signInUrl: payload.signInUrl,
      paymentFailed: payload.paymentFailed === true,
      code: payload.code,
    };
  }
  if (payload.paid) return { ok: true, paid: true, purchaseId: payload.purchaseId };
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
    return { ok: true, processing: true, purchaseId: payload.purchaseId, paymentIntentId: payload.paymentIntentId };
  }
  return { ok: false, error: "Unexpected response.", status: 500 };
}

export async function syncLiveItemVariantPurchase(args: {
  liveRoomId: string;
  itemId: string;
  variantId: string;
  purchaseId: string;
}): Promise<LiveVariantPurchaseClientResult> {
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/variants/${encodeURIComponent(args.variantId)}/purchase`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "sync", purchaseId: args.purchaseId }),
    },
  );
  const payload = (await res.json()) as {
    error?: string;
    paid?: boolean;
    purchaseId?: string;
    requiresAction?: boolean;
    clientSecret?: string;
    paymentIntentId?: string;
    processing?: boolean;
    code?: string;
    paymentFailed?: boolean;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: typeof payload.error === "string" ? payload.error : "Payment sync failed.",
      status: res.status,
      paymentFailed: payload.paymentFailed === true,
      code: payload.code,
    };
  }
  if (payload.paid) return { ok: true, paid: true, purchaseId: payload.purchaseId ?? args.purchaseId };
  if (payload.requiresAction && payload.clientSecret && payload.paymentIntentId) {
    return {
      ok: true,
      requiresAction: true,
      purchaseId: payload.purchaseId ?? args.purchaseId,
      clientSecret: payload.clientSecret,
      paymentIntentId: payload.paymentIntentId,
    };
  }
  if (payload.processing && payload.paymentIntentId) {
    return {
      ok: true,
      processing: true,
      purchaseId: payload.purchaseId ?? args.purchaseId,
      paymentIntentId: payload.paymentIntentId,
    };
  }
  return { ok: false, error: "Unexpected sync response.", status: 500 };
}
