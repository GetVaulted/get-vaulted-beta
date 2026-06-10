import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import type { VaultOrderRow } from './ordersRepository';

export type SellerSalesOrderRow = VaultOrderRow & {
  paymentStatus?: string;
  fulfillmentStatus?: string;
  commerceBucket?: string;
};

/** Seller orders — server is authoritative; do not re-filter layaways client-side. */
export async function fetchSellerSalesOrders(accessToken: string): Promise<SellerSalesOrderRow[]> {
  const res = await fetchWebApiAuthed('/api/account/sales', accessToken);
  const body = (await res.json().catch(() => null)) as {
    orders?: Array<{
      id: string;
      totalUsd: number;
      status: string;
      paymentStatus: string;
      fulfillmentStatus?: string;
      commerceBucket?: string;
      createdAt: string;
      listing?: { id: string; title: string; status?: string };
      buyer?: { username: string | null };
    }>;
  } | null;
  if (!res.ok || !Array.isArray(body?.orders)) return [];

  return body.orders.map((o) => ({
    id: o.id,
    listingId: o.listing?.id ?? '',
    listingTitle: o.listing?.title ?? 'Vault order',
    buyerId: '',
    sellerId: '',
    buyerUsername: o.buyer?.username ?? null,
    status: o.status,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    commerceBucket: o.commerceBucket,
    totalCents: Math.round(o.totalUsd * 100),
    createdAt: o.createdAt,
  }));
}
