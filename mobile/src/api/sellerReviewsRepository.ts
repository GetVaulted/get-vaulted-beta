import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import { hasReviewedReference } from '../platform/platformStore';

export type SellerReviewSummary = {
  count: number;
  /** One decimal; null when there are no reviews. */
  average: number | null;
  /** Counts for 5, 4, 3, 2, 1 stars (index 0 = 5 stars). */
  distribution: number[];
};

export type PublicSellerReview = {
  id: string;
  rating: number;
  body: string;
  tags: string[];
  createdAt: string;
  buyer: { username: string; image: string | null };
  itemTitle: string | null;
};

export type SellerReviewsPage = {
  summary: SellerReviewSummary;
  reviews: PublicSellerReview[];
  page: number;
  hasMore: boolean;
};

export const EMPTY_REVIEW_SUMMARY: SellerReviewSummary = { count: 0, average: null, distribution: [0, 0, 0, 0, 0] };

/** Public: a seller's verified-buyer reviews, newest first (20 per page). */
export async function fetchSellerReviews(sellerId: string, page = 1): Promise<SellerReviewsPage | null> {
  const res = await fetchWebApiMobile(
    `/api/sellers/reviews?sellerId=${encodeURIComponent(sellerId)}&page=${page}`,
    { method: 'GET' },
  );
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as Partial<SellerReviewsPage> | null;
  if (!body?.summary || !Array.isArray(body.reviews)) return null;
  return { summary: body.summary, reviews: body.reviews, page: body.page ?? page, hasMore: Boolean(body.hasMore) };
}

export type OrderReviewState = {
  canReview: boolean;
  reviewed: boolean;
  /** Why the buyer can't review yet (e.g. not delivered), when the server says. */
  message: string | null;
};

export async function fetchOrderReviewState(accessToken: string, orderId: string): Promise<OrderReviewState | null> {
  const res = await fetchWebApiAuthed(`/api/account/orders/${encodeURIComponent(orderId)}/review`, accessToken, {
    method: 'GET',
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    canReview?: boolean;
    message?: string | null;
    review?: unknown;
  } | null;
  if (!body) return null;
  return { canReview: Boolean(body.canReview), reviewed: body.review != null, message: body.message ?? null };
}

/** Posts the one review for an order. Throws the server's message on failure. */
export async function submitSellerReview(
  accessToken: string,
  orderId: string,
  input: { rating: number; body: string; tags: string[] },
): Promise<void> {
  const res = await fetchWebApiAuthed(`/api/account/orders/${encodeURIComponent(orderId)}/review`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.ok) return;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error?.trim() || 'Could not post your review. Try again.');
}

/**
 * Has this buyer already reviewed the seller for this order? Checks the server (the source of truth,
 * so a review left on the web counts) and falls back to the older on-device record.
 */
export async function hasReviewedSellerOrder(
  userId: string,
  orderId: string,
  accessToken?: string | null,
): Promise<boolean> {
  if (accessToken) {
    const state = await fetchOrderReviewState(accessToken, orderId).catch(() => null);
    if (state?.reviewed) return true;
  }
  return hasReviewedReference(userId, orderId, 'buyer_to_seller');
}
