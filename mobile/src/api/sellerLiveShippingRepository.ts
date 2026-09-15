/**
 * Seller live shipping dashboard + bundled labels — same APIs as web Sales ship queue.
 */
import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type SellerLabelPrintFormat = 'thermal_4x6' | 'letter';

export type ManualParcel = {
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
};

export type SellerLiveShippingOrderRow = {
  id: string;
  listingTitle: string;
  shipAlone: boolean;
  paymentStatus: string;
  fulfillmentStatus: string;
  hasLabel: boolean;
  trackingNumber: string | null;
};

export type SellerLiveShippingSessionRow = {
  sessionId: string;
  liveShowId: string;
  liveShowTitle: string;
  liveShowStatus: string;
  buyer: { id: string; username: string; name: string | null };
  destinationAddressId: string | null;
  bundled: boolean;
  itemCount: number;
  orderCount: number;
  pricingWeightOz: number;
  canCreateBundledLabel: boolean;
  bundledLabel: {
    labelUrl: string | null;
    trackingNumber: string | null;
    shippoTransactionId: string | null;
  } | null;
  orders: SellerLiveShippingOrderRow[];
};

export type SellerLiveShippingDashboard = {
  sessions: SellerLiveShippingSessionRow[];
  labelSetup?: {
    shippoTokenPresent: boolean;
    shippoApiOk: boolean;
    shippoApiError: string | null;
    shipFromComplete: boolean;
    shipFromNeedsPhoneOnly: boolean;
  };
};

export type PreviewShippingRate = {
  objectId: string;
  amountCents: number;
  carrier: string;
  service: string;
  estimatedDays: number | null;
};

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function normalizeOrder(raw: Record<string, unknown>): SellerLiveShippingOrderRow | null {
  const id = asString(raw.id).trim();
  if (!id) return null;
  return {
    id,
    listingTitle: asString(raw.listingTitle, 'Order'),
    shipAlone: raw.shipAlone === true,
    paymentStatus: asString(raw.paymentStatus, 'unknown'),
    fulfillmentStatus: asString(raw.fulfillmentStatus, 'unknown'),
    hasLabel: raw.hasLabel === true,
    trackingNumber: typeof raw.trackingNumber === 'string' ? raw.trackingNumber : null,
  };
}

function normalizeSession(raw: Record<string, unknown>): SellerLiveShippingSessionRow | null {
  const sessionId = asString(raw.sessionId).trim();
  if (!sessionId) return null;
  const buyerRaw = raw.buyer && typeof raw.buyer === 'object' ? (raw.buyer as Record<string, unknown>) : {};
  const bundledLabelRaw =
    raw.bundledLabel && typeof raw.bundledLabel === 'object'
      ? (raw.bundledLabel as Record<string, unknown>)
      : null;
  const orders = Array.isArray(raw.orders)
    ? raw.orders
        .map((o) => (o && typeof o === 'object' ? normalizeOrder(o as Record<string, unknown>) : null))
        .filter((o): o is SellerLiveShippingOrderRow => o != null)
    : [];

  return {
    sessionId,
    liveShowId: asString(raw.liveShowId),
    liveShowTitle: asString(raw.liveShowTitle, 'Live show'),
    liveShowStatus: asString(raw.liveShowStatus),
    buyer: {
      id: asString(buyerRaw.id),
      username: asString(buyerRaw.username, 'buyer'),
      name: typeof buyerRaw.name === 'string' ? buyerRaw.name : null,
    },
    destinationAddressId: typeof raw.destinationAddressId === 'string' ? raw.destinationAddressId : null,
    bundled: raw.bundled === true,
    itemCount: asNumber(raw.itemCount),
    orderCount: asNumber(raw.orderCount, orders.length),
    pricingWeightOz: asNumber(raw.pricingWeightOz, 4),
    canCreateBundledLabel: raw.canCreateBundledLabel === true,
    bundledLabel: bundledLabelRaw
      ? {
          labelUrl: typeof bundledLabelRaw.labelUrl === 'string' ? bundledLabelRaw.labelUrl : null,
          trackingNumber:
            typeof bundledLabelRaw.trackingNumber === 'string' ? bundledLabelRaw.trackingNumber : null,
          shippoTransactionId:
            typeof bundledLabelRaw.shippoTransactionId === 'string'
              ? bundledLabelRaw.shippoTransactionId
              : null,
        }
      : null,
    orders,
  };
}

export async function fetchSellerLiveShippingDashboard(
  accessToken: string,
): Promise<SellerLiveShippingDashboard> {
  const res = await fetchWebApiAuthed('/api/account/live-shipping', accessToken);
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !body) return { sessions: [] };

  const sessions = Array.isArray(body.sessions)
    ? body.sessions
        .map((s) => (s && typeof s === 'object' ? normalizeSession(s as Record<string, unknown>) : null))
        .filter((s): s is SellerLiveShippingSessionRow => s != null)
    : [];

  const setupRaw =
    body.labelSetup && typeof body.labelSetup === 'object'
      ? (body.labelSetup as Record<string, unknown>)
      : null;

  return {
    sessions,
    labelSetup: setupRaw
      ? {
          shippoTokenPresent: setupRaw.shippoTokenPresent === true,
          shippoApiOk: setupRaw.shippoApiOk === true,
          shippoApiError: typeof setupRaw.shippoApiError === 'string' ? setupRaw.shippoApiError : null,
          shipFromComplete: setupRaw.shipFromComplete === true,
          shipFromNeedsPhoneOnly: setupRaw.shipFromNeedsPhoneOnly === true,
        }
      : undefined,
  };
}

export async function previewBundledShippingRates(
  accessToken: string,
  sessionId: string,
  parcel: ManualParcel,
): Promise<
  | { ok: true; rates: PreviewShippingRate[]; shippingChargedCents: number }
  | { ok: false; error: string }
> {
  const res = await fetchWebApiAuthed(
    `/api/account/live-shipping/${encodeURIComponent(sessionId)}/preview-rates`,
    accessToken,
    { method: 'POST', body: JSON.stringify(parcel) },
  );
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    rates?: PreviewShippingRate[];
    shippingChargedCents?: number;
  } | null;
  if (!res.ok) {
    return { ok: false, error: body?.error ?? 'Could not quote shipping rates.' };
  }
  const rates = Array.isArray(body?.rates)
    ? body!.rates.filter((r) => r && typeof r.objectId === 'string' && r.objectId)
    : [];
  return {
    ok: true,
    rates,
    shippingChargedCents: typeof body?.shippingChargedCents === 'number' ? body.shippingChargedCents : 0,
  };
}

export async function createBundledShippingLabel(
  accessToken: string,
  sessionId: string,
  opts: {
    manualParcel: ManualParcel;
    labelFormat?: SellerLabelPrintFormat;
    selectedRateObjectId?: string;
  },
): Promise<
  | {
      ok: true;
      labelUrl: string | null;
      trackingNumber: string | null;
      trackingUrl: string | null;
      orderIds: string[];
      warning?: string;
    }
  | { ok: false; error: string; code?: string }
> {
  const res = await fetchWebApiAuthed(
    `/api/account/live-shipping/${encodeURIComponent(sessionId)}/create-label`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        manualParcel: opts.manualParcel,
        labelFormat: opts.labelFormat ?? 'thermal_4x6',
        selectedRateObjectId: opts.selectedRateObjectId,
      }),
    },
  );
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    code?: string;
    warning?: string;
    labelUrl?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    orderIds?: string[];
  } | null;
  if (!res.ok) {
    return { ok: false, error: body?.error ?? 'Could not create bundled label.', code: body?.code };
  }
  return {
    ok: true,
    labelUrl: body?.labelUrl ?? null,
    trackingNumber: body?.trackingNumber ?? null,
    trackingUrl: body?.trackingUrl ?? null,
    orderIds: Array.isArray(body?.orderIds) ? body!.orderIds : [],
    warning: body?.warning,
  };
}
