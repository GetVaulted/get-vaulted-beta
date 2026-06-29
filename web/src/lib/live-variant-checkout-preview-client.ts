export type LiveVariantCheckoutPreview = {
  itemPriceUsd: number;
  shippingUsd: number;
  shippingDisplay: string;
  taxUsd: number;
  taxDisplay: string;
  chargeNowUsd: number;
  estimatedTotalUsd: number;
  taxNote: string | null;
};

export async function fetchLiveVariantCheckoutPreview(args: {
  liveRoomId: string;
  itemId: string;
  itemPriceUsd: number;
}): Promise<LiveVariantCheckoutPreview | null> {
  const sp = new URLSearchParams({ itemPriceUsd: String(args.itemPriceUsd) });
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/checkout-preview?${sp.toString()}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as LiveVariantCheckoutPreview;
  if (typeof body?.chargeNowUsd !== "number" || typeof body?.estimatedTotalUsd !== "number") return null;
  return body;
}
