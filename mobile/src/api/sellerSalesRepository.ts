import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import type { VaultOrderRow } from './ordersRepository';

export type SellerSalesOrderRow = VaultOrderRow & {
  paymentStatus?: string;
  fulfillmentStatus?: string;
  commerceBucket?: string;
  labelUrl?: string | null;
  shippoTransactionId?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
};

export type CreateSellerLabelResult =
  | { ok: true; labelUrl: string | null; trackingNumber: string | null; trackingUrl: string | null }
  | { ok: false; error: string; code?: string };

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
      labelUrl?: string | null;
      shippoTransactionId?: string | null;
      trackingNumber?: string | null;
      trackingUrl?: string | null;
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
    labelUrl: o.labelUrl ?? null,
    shippoTransactionId: o.shippoTransactionId ?? null,
    trackingNumber: o.trackingNumber ?? null,
    trackingUrl: o.trackingUrl ?? null,
    totalCents: Math.round(o.totalUsd * 100),
    createdAt: o.createdAt,
  }));
}

/** Purchase a Shippo label for a paid seller order (same endpoint as web Seller Studio). */
export async function createSellerShippingLabel(
  accessToken: string,
  orderId: string,
): Promise<CreateSellerLabelResult> {
  const res = await fetchWebApiAuthed(
    `/api/account/sales/${encodeURIComponent(orderId)}/create-label`,
    accessToken,
    { method: 'POST' },
  );
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    code?: string;
    warning?: string;
    order?: {
      labelUrl?: string | null;
      trackingNumber?: string | null;
      trackingUrl?: string | null;
      fulfillmentStatus?: string;
    };
  } | null;

  if (!res.ok) {
    return { ok: false, error: body?.error ?? 'Could not create shipping label.', code: body?.code };
  }

  if (body?.order?.fulfillmentStatus === 'exception') {
    return {
      ok: false,
      error:
        body.warning ??
        'Shippo did not produce a label. Confirm ship-from address and listing parcel dimensions.',
    };
  }

  return {
    ok: true,
    labelUrl: body?.order?.labelUrl ?? null,
    trackingNumber: body?.order?.trackingNumber ?? null,
    trackingUrl: body?.order?.trackingUrl ?? null,
  };
}
