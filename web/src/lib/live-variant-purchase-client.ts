/** Client idempotency keys for live variant checkout. */

export function createLiveVariantPurchaseIdempotencyKey(variantId: string): string {
  const bucket = Math.floor(Date.now() / 30_000);
  return `lv_purchase_${variantId}_${bucket}`;
}

export async function purchaseLiveItemVariant(args: {
  liveRoomId: string;
  itemId: string;
  variantId: string;
  quantity?: number;
  idempotencyKey?: string;
}): Promise<
  | { ok: true; paid: true }
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: string; status: number; signInUrl?: string; walletIncomplete?: boolean }
> {
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/variants/${encodeURIComponent(args.variantId)}/purchase`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": args.idempotencyKey ?? createLiveVariantPurchaseIdempotencyKey(args.variantId),
      },
      credentials: "include",
      body: JSON.stringify({ quantity: args.quantity ?? 1 }),
    },
  );
  const payload = (await res.json()) as {
    error?: string;
    checkoutUrl?: string;
    paid?: boolean;
    signInUrl?: string;
    code?: string;
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
    };
  }
  if (payload.paid) return { ok: true, paid: true };
  if (payload.checkoutUrl) return { ok: true, checkoutUrl: payload.checkoutUrl };
  return { ok: false, error: "Unexpected response.", status: 500 };
}
