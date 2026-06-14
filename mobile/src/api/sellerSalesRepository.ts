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

export type SellerSalesOrderDetail = {
  id: string;
  totalUsd: number;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd: number;
  taxAmountCents?: number;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  commerceBucket?: string;
  createdAt: string;
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  shippoTransactionId: string | null;
  paymentDeadlineAt: string | null;
  payoutStatus: string;
  payoutBlockedReason: string | null;
  payoutHoldUntil: string | null;
  payoutReserveAmountCents: number;
  deliveryConfirmedAt: string | null;
  payoutMethod: string;
  platformFeePercent: number;
  platformFeeEstimateUsd: number;
  stripeProcessingFeeEstimateUsd: number;
  payoutEstimateUsd: number;
  sellerNextAction: string;
  listing: {
    id: string;
    title: string;
    status: string;
    images?: { url: string }[];
  };
  buyer: { username: string | null };
};

type SellerSalesApiOrder = SellerSalesOrderDetail;

function coerceUsd(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function normalizeSellerSalesOrder(raw: Record<string, unknown>): SellerSalesOrderDetail | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;

  const listingRaw = raw.listing;
  const listing =
    listingRaw && typeof listingRaw === 'object'
      ? (listingRaw as SellerSalesOrderDetail['listing'])
      : { id: '', title: 'Vault order', status: 'unknown' };

  const buyerRaw = raw.buyer;
  const buyer =
    buyerRaw && typeof buyerRaw === 'object'
      ? (buyerRaw as SellerSalesOrderDetail['buyer'])
      : { username: null };

  return {
    id,
    totalUsd: coerceUsd(raw.totalUsd),
    itemPriceUsd: coerceUsd(raw.itemPriceUsd),
    shippingPriceUsd: coerceUsd(raw.shippingPriceUsd),
    taxUsd: coerceUsd(raw.taxUsd),
    taxAmountCents: coerceUsd(raw.taxAmountCents),
    status: typeof raw.status === 'string' ? raw.status : 'unknown',
    paymentStatus: typeof raw.paymentStatus === 'string' ? raw.paymentStatus : 'unknown',
    fulfillmentStatus: typeof raw.fulfillmentStatus === 'string' ? raw.fulfillmentStatus : 'unknown',
    commerceBucket: typeof raw.commerceBucket === 'string' ? raw.commerceBucket : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    shipRecipientName: typeof raw.shipRecipientName === 'string' ? raw.shipRecipientName : '',
    shipAddress: typeof raw.shipAddress === 'string' ? raw.shipAddress : '',
    shipCity: typeof raw.shipCity === 'string' ? raw.shipCity : '',
    shipState: typeof raw.shipState === 'string' ? raw.shipState : '',
    shipZip: typeof raw.shipZip === 'string' ? raw.shipZip : '',
    shipCountry: typeof raw.shipCountry === 'string' ? raw.shipCountry : '',
    carrier: typeof raw.carrier === 'string' ? raw.carrier : null,
    service: typeof raw.service === 'string' ? raw.service : null,
    trackingNumber: typeof raw.trackingNumber === 'string' ? raw.trackingNumber : null,
    trackingUrl: typeof raw.trackingUrl === 'string' ? raw.trackingUrl : null,
    labelUrl: typeof raw.labelUrl === 'string' ? raw.labelUrl : null,
    shippoTransactionId: typeof raw.shippoTransactionId === 'string' ? raw.shippoTransactionId : null,
    paymentDeadlineAt: typeof raw.paymentDeadlineAt === 'string' ? raw.paymentDeadlineAt : null,
    payoutStatus: typeof raw.payoutStatus === 'string' ? raw.payoutStatus : 'pending',
    payoutBlockedReason: typeof raw.payoutBlockedReason === 'string' ? raw.payoutBlockedReason : null,
    payoutHoldUntil: typeof raw.payoutHoldUntil === 'string' ? raw.payoutHoldUntil : null,
    payoutReserveAmountCents: coerceUsd(raw.payoutReserveAmountCents),
    deliveryConfirmedAt: typeof raw.deliveryConfirmedAt === 'string' ? raw.deliveryConfirmedAt : null,
    payoutMethod: typeof raw.payoutMethod === 'string' ? raw.payoutMethod : 'stripe',
    platformFeePercent: coerceUsd(raw.platformFeePercent),
    platformFeeEstimateUsd: coerceUsd(raw.platformFeeEstimateUsd),
    stripeProcessingFeeEstimateUsd: coerceUsd(raw.stripeProcessingFeeEstimateUsd),
    payoutEstimateUsd: coerceUsd(raw.payoutEstimateUsd),
    sellerNextAction: typeof raw.sellerNextAction === 'string' ? raw.sellerNextAction : '',
    listing,
    buyer,
  };
}

function mapApiOrderToRow(o: SellerSalesApiOrder): SellerSalesOrderRow {
  return {
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
  };
}

function parseSellerSalesListBody(body: unknown): SellerSalesOrderDetail[] {
  if (!body || typeof body !== 'object') return [];
  const orders = (body as { orders?: unknown }).orders;
  if (!Array.isArray(orders)) return [];
  return orders
    .map((o) =>
      o && typeof o === 'object' ? normalizeSellerSalesOrder(o as Record<string, unknown>) : null,
    )
    .filter((o): o is SellerSalesOrderDetail => o != null);
}

async function fetchSellerSalesList(accessToken: string): Promise<SellerSalesOrderDetail[]> {
  const res = await fetchWebApiAuthed('/api/account/sales', accessToken);
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) return [];
  return parseSellerSalesListBody(body);
}

/** Seller order detail — read-only on mobile; label purchase stays on web Seller Studio. */
export async function fetchSellerSalesOrderById(
  accessToken: string,
  orderId: string,
): Promise<SellerSalesOrderDetail | null> {
  const trimmedId = orderId.trim();
  if (!trimmedId) return null;

  const res = await fetchWebApiAuthed(
    `/api/account/sales/${encodeURIComponent(trimmedId)}`,
    accessToken,
  );
  const body = (await res.json().catch(() => null)) as { order?: unknown; error?: string } | null;
  if (res.ok && body?.order && typeof body.order === 'object') {
    return normalizeSellerSalesOrder(body.order as Record<string, unknown>);
  }

  // Fallback when detail route is not deployed yet: list payload includes the same fields.
  const list = await fetchSellerSalesList(accessToken);
  return list.find((o) => o.id === trimmedId) ?? null;
}

/** Seller orders — server is authoritative; do not re-filter layaways client-side. */
export async function fetchSellerSalesOrders(accessToken: string): Promise<SellerSalesOrderRow[]> {
  const list = await fetchSellerSalesList(accessToken);
  return list.map(mapApiOrderToRow);
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
