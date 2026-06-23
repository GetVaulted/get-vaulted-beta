import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type BuyerLiveOrderKind = 'order' | 'break_spot' | 'variant_purchase' | 'giveaway';

export type BuyerLiveOrderPaymentTone = 'paid' | 'retry' | 'pending';

export type BuyerLiveOrder = {
  id: string;
  kind: BuyerLiveOrderKind;
  liveRoomId: string;
  liveRoomTitle: string;
  sellerUsername: string;
  title: string;
  spotLabel: string | null;
  amountUsd: number;
  paymentTone: BuyerLiveOrderPaymentTone;
  statusLabel: string;
  occurredAt: string;
  orderId: string | null;
  thumbnailUrl: string | null;
  href: string;
};

export async function fetchBuyerLiveOrders(accessToken: string): Promise<BuyerLiveOrder[]> {
  const res = await fetchWebApiAuthed('/api/account/live-orders', accessToken);
  if (!res.ok) {
    console.warn('fetchBuyerLiveOrders', res.status);
    return [];
  }
  const data = (await res.json()) as { orders?: BuyerLiveOrder[] };
  return Array.isArray(data.orders) ? data.orders : [];
}
