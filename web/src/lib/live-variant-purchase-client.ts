/** Client idempotency keys for live variant checkout. */

export function createLiveVariantPurchaseIdempotencyKey(variantId: string): string {
  const bucket = Math.floor(Date.now() / 30_000);
  return `lv_purchase_${variantId}_${bucket}`;
}

export function createLiveVariantBatchPurchaseIdempotencyKey(variantIds: string[]): string {
  const bucket = Math.floor(Date.now() / 30_000);
  const sorted = [...variantIds].sort().join("_").slice(0, 80);
  return `lv_batch_${sorted}_${bucket}`;
}

export type LiveVariantPurchaseClientResult =
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
  requiresAction?: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  publishableKey?: string;
  processing?: boolean;
};

function mapPurchasePayload(
  res: Response,
  payload: PurchasePayload,
): LiveVariantPurchaseClientResult {
  if (res.status === 402) {
    return {
      ok: false,
      error: payload.error ?? "Wallet incomplete.",
      status: 402,
      walletIncomplete: true,
      paymentFailed: payload.paymentFailed === true,
      code: payload.code,
    };
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
    const purchaseId = payload.purchaseId ?? payload.purchaseIds?.[0] ?? payload.batchId;
    if (!purchaseId) return { ok: false, error: "Unexpected response.", status: 500 };
    return {
      ok: true,
      requiresAction: true,
      purchaseId,
      batchId: payload.batchId,
      clientSecret: payload.clientSecret,
      paymentIntentId: payload.paymentIntentId,
      publishableKey: payload.publishableKey,
    };
  }
  if (payload.processing && payload.paymentIntentId) {
    const purchaseId = payload.purchaseId ?? payload.purchaseIds?.[0] ?? payload.batchId;
    if (!purchaseId) return { ok: false, error: "Unexpected response.", status: 500 };
    return {
      ok: true,
      processing: true,
      purchaseId,
      batchId: payload.batchId,
      paymentIntentId: payload.paymentIntentId,
    };
  }
  return { ok: false, error: "Unexpected response.", status: 500 };
}

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
  const payload = (await res.json()) as PurchasePayload;
  return mapPurchasePayload(res, payload);
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
  const payload = (await res.json()) as PurchasePayload;
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

export async function purchaseLiveItemVariantBatch(args: {
  liveRoomId: string;
  itemId: string;
  variantIds: string[];
  idempotencyKey?: string;
  paymentMethodId?: string;
}): Promise<LiveVariantPurchaseClientResult> {
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/variants/batch-purchase`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key":
          args.idempotencyKey ?? createLiveVariantBatchPurchaseIdempotencyKey(args.variantIds),
      },
      credentials: "include",
      body: JSON.stringify({
        variantIds: args.variantIds,
        paymentMethodId: args.paymentMethodId,
      }),
    },
  );
  const payload = (await res.json()) as PurchasePayload;
  return mapPurchasePayload(res, payload);
}

export async function syncLiveItemVariantPurchaseBatch(args: {
  liveRoomId: string;
  itemId: string;
  batchId: string;
}): Promise<LiveVariantPurchaseClientResult> {
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/variants/batch-purchase`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "sync", batchId: args.batchId }),
    },
  );
  const payload = (await res.json()) as PurchasePayload;
  if (!res.ok) {
    return {
      ok: false,
      error: typeof payload.error === "string" ? payload.error : "Payment sync failed.",
      status: res.status,
      paymentFailed: payload.paymentFailed === true,
      code: payload.code,
    };
  }
  if (payload.paid) {
    return {
      ok: true,
      paid: true,
      batchId: payload.batchId ?? args.batchId,
      purchaseIds: payload.purchaseIds,
      labels: payload.labels,
    };
  }
  if (payload.requiresAction && payload.clientSecret && payload.paymentIntentId) {
    return {
      ok: true,
      requiresAction: true,
      purchaseId: payload.purchaseId ?? args.batchId,
      batchId: payload.batchId ?? args.batchId,
      clientSecret: payload.clientSecret,
      paymentIntentId: payload.paymentIntentId,
    };
  }
  if (payload.processing && payload.paymentIntentId) {
    return {
      ok: true,
      processing: true,
      purchaseId: payload.purchaseId ?? args.batchId,
      batchId: payload.batchId ?? args.batchId,
      paymentIntentId: payload.paymentIntentId,
    };
  }
  return { ok: false, error: "Unexpected sync response.", status: 500 };
}
