import { fetchListingsByIdsFromWeb } from './webListingsRepository';
import { resolveListingImageUrl } from './mapWebMarketplaceListing';
import { getSupabase } from '../lib/supabase';

export type BuyerOrderBucket = 'active' | 'delivered' | 'completed' | 'canceled';

export type BuyerOrder = {
  id: string;
  listingId: string;
  listingTitle: string;
  thumbnailUrl: string | null;
  buyerId: string;
  sellerId: string;
  buyerUsername: string | null;
  sellerUsername: string | null;
  sellerAvatarUrl: string | null;
  status: string;
  totalCents: number;
  createdAt: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
  shipByDate: string | null;
  protectionLabel: string;
  statusLabel: string;
  trackingLabel: string;
  estimatedDelivery: string;
};

/** @deprecated use BuyerOrder */
export type VaultOrderRow = Pick<
  BuyerOrder,
  'id' | 'listingId' | 'listingTitle' | 'buyerId' | 'sellerId' | 'status' | 'totalCents' | 'createdAt'
> & {
  buyerUsername?: string | null;
  sellerUsername?: string | null;
};

const COMPLETE_STATUSES = new Set(['delivered', 'completed']);

export function isOrderCompleteForReview(status: string): boolean {
  return COMPLETE_STATUSES.has(status);
}

export function bucketForOrderStatus(status: string): BuyerOrderBucket {
  if (status === 'cancelled' || status === 'canceled') return 'canceled';
  if (status === 'delivered') return 'delivered';
  if (status === 'completed') return 'completed';
  if (status === 'pending_payment' || status === 'paid' || status === 'shipped' || status === 'disputed') {
    return 'active';
  }
  return 'active';
}

function firstMediaUrl(raw: unknown): string | null {
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].length > 0) return raw[0];
  return null;
}

function protectionLabel(status: string): string {
  switch (status) {
    case 'pending_payment':
      return 'Awaiting payment';
    case 'paid':
      return 'Vault protected · paid';
    case 'shipped':
      return 'In transit · protected';
    case 'delivered':
      return 'Delivered · vault lane';
    case 'completed':
      return 'Transaction complete';
    case 'disputed':
      return 'Dispute open · protected review';
    case 'cancelled':
    case 'canceled':
      return 'Canceled';
    default:
      return 'Vault protected';
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

type OrderDbRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  total_cents: number;
  created_at: string;
};

type LabelRow = {
  order_id: string;
  tracking_number: string | null;
  tracking_url: string | null;
  carrier: string | null;
  ship_by_date: string | null;
  status: string | null;
};

async function enrichBuyerOrders(rows: OrderDbRow[]): Promise<BuyerOrder[]> {
  if (!rows.length) return [];
  const sb = getSupabase();
  const listingIds = [...new Set(rows.map((r) => r.listing_id))];
  const profileIds = [...new Set(rows.flatMap((r) => [r.buyer_id, r.seller_id]))];
  const orderIds = rows.map((r) => r.id);

  const titleMap = new Map<string, string>();
  const thumbMap = new Map<string, string | null>();
  const profileMap = new Map<string, { username: string | null; avatar: string | null }>();
  const labelMap = new Map<string, LabelRow>();

  const [webListings, profilesResult, labelsResult] = await Promise.all([
    fetchListingsByIdsFromWeb(listingIds),
    sb
      ? sb.from('profiles').select('id, username, avatar_url').in('id', profileIds)
      : Promise.resolve({ data: null }),
    sb
      ? sb
          .from('shipping_labels')
          .select('order_id, tracking_number, tracking_url, carrier, ship_by_date, status')
          .in('order_id', orderIds)
      : Promise.resolve({ data: null }),
  ]);

  for (const l of webListings) {
    titleMap.set(l.id, l.title ?? 'Vault listing');
    thumbMap.set(l.id, resolveListingImageUrl(l.imageUrls?.[0]) ?? null);
  }

  if (sb) {
    const { data: profiles } = profilesResult;
    const { data: labels } = labelsResult;
    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        username: (p.username as string) ?? null,
        avatar: (p.avatar_url as string) ?? null,
      });
    }
    for (const lb of (labels ?? []) as LabelRow[]) {
      if (lb.order_id) labelMap.set(lb.order_id, lb);
    }
  } else {
    for (const lb of (labelsResult.data ?? []) as LabelRow[]) {
      if (lb.order_id) labelMap.set(lb.order_id, lb);
    }
  }

  return rows.map((row) => {
    const seller = profileMap.get(row.seller_id);
    const buyer = profileMap.get(row.buyer_id);
    const label = labelMap.get(row.id);
    const trackingNumber = label?.tracking_number ?? null;
    const trackingUrl = label?.tracking_url ?? null;
    const shipBy = label?.ship_by_date ?? null;
    let trackingLabel = 'Label pending';
    if (trackingNumber) trackingLabel = `Tracking · ${trackingNumber}`;
    else if (label?.status === 'purchased') trackingLabel = 'Label purchased';
    let estimatedDelivery = 'Updates when carrier scans';
    if (shipBy) {
      try {
        estimatedDelivery = `Est. ship by ${new Date(shipBy).toLocaleDateString()}`;
      } catch {
        estimatedDelivery = 'Est. delivery pending';
      }
    } else if (row.status === 'delivered' || row.status === 'completed') {
      estimatedDelivery = 'Delivered to your vault address';
    }

    return {
      id: row.id,
      listingId: row.listing_id,
      listingTitle: titleMap.get(row.listing_id) ?? 'Vault listing',
      thumbnailUrl: thumbMap.get(row.listing_id) ?? null,
      buyerId: row.buyer_id,
      buyerUsername: buyer?.username ?? null,
      sellerId: row.seller_id,
      sellerUsername: seller?.username ?? null,
      sellerAvatarUrl: seller?.avatar ?? null,
      status: row.status,
      totalCents: Number(row.total_cents) || 0,
      createdAt: row.created_at,
      trackingNumber,
      trackingUrl,
      carrier: label?.carrier ?? null,
      shipByDate: shipBy,
      protectionLabel: protectionLabel(row.status),
      statusLabel: statusLabel(row.status),
      trackingLabel,
      estimatedDelivery,
    };
  });
}

const ORDER_SELECT = 'id, listing_id, buyer_id, seller_id, status, total_cents, created_at';

export async function fetchBuyerOrdersDetailed(userId: string): Promise<BuyerOrder[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('orders')
    .select(ORDER_SELECT)
    .eq('buyer_id', userId)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error || !data) {
    if (error) console.warn('fetchBuyerOrdersDetailed', error.message);
    return [];
  }
  return enrichBuyerOrders(data as OrderDbRow[]);
}

export async function fetchBuyerOrderById(userId: string, orderId: string): Promise<BuyerOrder | null> {
  const orders = await fetchBuyerOrdersDetailed(userId);
  return orders.find((o) => o.id === orderId) ?? null;
}

export async function fetchBuyerOrders(userId: string): Promise<VaultOrderRow[]> {
  return fetchBuyerOrdersDetailed(userId);
}

export async function countActiveBuyerOrders(userId: string): Promise<number> {
  const orders = await fetchBuyerOrdersDetailed(userId);
  return orders.filter((o) => bucketForOrderStatus(o.status) === 'active').length;
}

async function enrichOrders(rows: OrderDbRow[]): Promise<VaultOrderRow[]> {
  return enrichBuyerOrders(rows);
}

/** @deprecated Seller commerce uses `/api/account/sales` via sellerSalesRepository. */
export async function fetchSellerOrders(userId: string): Promise<VaultOrderRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('orders')
    .select(ORDER_SELECT)
    .eq('seller_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) {
    if (error) console.warn('fetchSellerOrders', error.message);
    return [];
  }
  return enrichOrders(data as OrderDbRow[]);
}

export async function fetchCompletedOrdersForUser(userId: string): Promise<VaultOrderRow[]> {
  const buyer = await fetchBuyerOrders(userId);
  const seller = await fetchSellerOrders(userId);
  const seen = new Set<string>();
  return [...buyer, ...seller].filter((o) => {
    if (!isOrderCompleteForReview(o.status) || seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
}

export async function countCompletedSalesForSeller(sellerId: string): Promise<number> {
  const orders = await fetchSellerOrders(sellerId);
  return orders.filter((o) => isOrderCompleteForReview(o.status)).length;
}
