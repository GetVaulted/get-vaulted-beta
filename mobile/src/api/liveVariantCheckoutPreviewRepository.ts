import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

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

function parseLiveVariantCheckoutPreview(body: unknown): LiveVariantCheckoutPreview | null {
  const row = body as LiveVariantCheckoutPreview | null;
  if (!row || typeof row.chargeNowUsd !== 'number' || typeof row.estimatedTotalUsd !== 'number') return null;
  return row;
}

export async function fetchLiveVariantCheckoutPreview(
  accessToken: string,
  args: {
    liveRoomId: string;
    itemId: string;
    itemPriceUsd: number;
  },
): Promise<LiveVariantCheckoutPreview | null> {
  const sp = new URLSearchParams({ itemPriceUsd: String(args.itemPriceUsd) });
  const res = await fetchWebApiAuthed(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/checkout-preview?${sp.toString()}`,
    accessToken,
    { method: 'GET' },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    console.warn('[checkout-preview] unavailable', {
      status: res.status,
      liveRoomId: args.liveRoomId,
      itemId: args.itemId,
      itemPriceUsd: args.itemPriceUsd,
      error: (errBody as { error?: string } | null)?.error ?? null,
    });
    return null;
  }
  return parseLiveVariantCheckoutPreview(await res.json().catch(() => null));
}
