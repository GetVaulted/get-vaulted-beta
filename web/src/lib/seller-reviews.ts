/**
 * Verified-buyer seller reviews: input validation, who may review which order, and rating summaries.
 * One review per order, written by that order's buyer after delivery.
 */

export const REVIEW_BODY_MAX = 1000;
export const REVIEW_TAGS_MAX = 5;
export const REVIEW_TAG_MAX_LEN = 40;

/** Quick tags a buyer can tap (same set in the app). Free-form tags are still accepted by the API. */
export const SELLER_REVIEW_QUICK_TAGS = [
  "Fast shipping",
  "Trusted seller",
  "Great packaging",
  "Easy trade",
  "Great communication",
  "Smooth deal",
  "Vault verified experience",
] as const;

export type ReviewInput = { rating: number; body: string; tags: string[] };

export type ParsedReviewInput = { ok: true; value: ReviewInput } | { ok: false; error: string };

function cleanText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseReviewInput(raw: unknown): ParsedReviewInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Send a rating and an optional comment." };
  }
  const src = raw as Record<string, unknown>;
  const rating = src.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Choose a rating from 1 to 5 stars." };
  }
  let body = "";
  if (src.body !== undefined && src.body !== null) {
    if (typeof src.body !== "string") return { ok: false, error: "Review text must be text." };
    body = Array.from(cleanText(src.body)).slice(0, REVIEW_BODY_MAX).join("").trim();
  }
  const tags: string[] = [];
  if (src.tags !== undefined && src.tags !== null) {
    if (!Array.isArray(src.tags)) return { ok: false, error: "Tags must be a list." };
    for (const t of src.tags) {
      if (typeof t !== "string") return { ok: false, error: "Tags must be text." };
      const tag = cleanText(t).replace(/\s+/g, " ").slice(0, REVIEW_TAG_MAX_LEN);
      if (tag && !tags.includes(tag)) tags.push(tag);
      if (tags.length >= REVIEW_TAGS_MAX) break;
    }
  }
  return { ok: true, value: { rating, body, tags } };
}

export type ReviewableOrder = {
  buyerId: string;
  paymentStatus: string;
  status: string;
  fulfillmentStatus: string;
  deliveryConfirmedAt: Date | null;
};

export function orderIsDelivered(o: Pick<ReviewableOrder, "status" | "fulfillmentStatus" | "deliveryConfirmedAt">): boolean {
  return (
    o.deliveryConfirmedAt != null ||
    o.fulfillmentStatus === "delivered" ||
    o.status === "delivered" ||
    o.status === "completed"
  );
}

export type ReviewBlockReason = "not_buyer" | "not_paid" | "not_delivered" | "already_reviewed";

export function reviewEligibility(
  order: ReviewableOrder,
  viewerId: string,
  alreadyReviewed: boolean,
): { canReview: true; reason: null } | { canReview: false; reason: ReviewBlockReason } {
  if (order.buyerId !== viewerId) return { canReview: false, reason: "not_buyer" };
  if (alreadyReviewed) return { canReview: false, reason: "already_reviewed" };
  if (order.paymentStatus !== "paid") return { canReview: false, reason: "not_paid" };
  if (!orderIsDelivered(order)) return { canReview: false, reason: "not_delivered" };
  return { canReview: true, reason: null };
}

export function reviewBlockMessage(reason: ReviewBlockReason): string {
  switch (reason) {
    case "not_buyer":
      return "Only the buyer can review this order.";
    case "already_reviewed":
      return "You already reviewed this order.";
    case "not_paid":
      return "This order isn't paid, so it can't be reviewed.";
    case "not_delivered":
      return "You can review a seller once the order is delivered.";
  }
}

export type ReviewSummary = {
  count: number;
  /** One decimal place; null when there are no reviews. */
  average: number | null;
  /** Counts for 5, 4, 3, 2, 1 stars (index 0 = 5 stars). */
  distribution: [number, number, number, number, number];
};

export function summaryFromDistribution(counts: Partial<Record<number, number>>): ReviewSummary {
  const distribution: ReviewSummary["distribution"] = [
    counts[5] ?? 0,
    counts[4] ?? 0,
    counts[3] ?? 0,
    counts[2] ?? 0,
    counts[1] ?? 0,
  ];
  const count = distribution.reduce((a, b) => a + b, 0);
  if (count === 0) return { count: 0, average: null, distribution };
  const total = distribution.reduce((sum, n, i) => sum + n * (5 - i), 0);
  return { count, average: Math.round((total / count) * 10) / 10, distribution };
}
