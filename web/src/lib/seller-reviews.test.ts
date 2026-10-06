import { describe, expect, it } from "vitest";
import {
  REVIEW_BODY_MAX,
  orderIsDelivered,
  parseReviewInput,
  reviewEligibility,
  summaryFromDistribution,
  type ReviewableOrder,
} from "@/lib/seller-reviews";

const order = (over: Partial<ReviewableOrder> = {}): ReviewableOrder => ({
  buyerId: "buyer",
  paymentStatus: "paid",
  status: "shipped",
  fulfillmentStatus: "delivered",
  deliveryConfirmedAt: null,
  ...over,
});

describe("parseReviewInput", () => {
  it("accepts a rating with optional text and tags", () => {
    expect(parseReviewInput({ rating: 5, body: "  Great seller\u0000 ", tags: ["Fast shipping", "Fast shipping", " Well packed "] })).toEqual({
      ok: true,
      value: { rating: 5, body: "Great seller", tags: ["Fast shipping", "Well packed"] },
    });
    expect(parseReviewInput({ rating: 3 })).toEqual({ ok: true, value: { rating: 3, body: "", tags: [] } });
  });
  it("rejects bad ratings", () => {
    for (const rating of [0, 6, 4.5, "5", null, undefined]) {
      expect(parseReviewInput({ rating })).toMatchObject({ ok: false });
    }
    expect(parseReviewInput(null)).toMatchObject({ ok: false });
  });
  it("caps body length and tag count", () => {
    const r = parseReviewInput({ rating: 4, body: "x".repeat(2000), tags: ["a", "b", "c", "d", "e", "f", "g"] });
    expect(r.ok && Array.from(r.value.body).length).toBe(REVIEW_BODY_MAX);
    expect(r.ok && r.value.tags).toHaveLength(5);
  });
  it("rejects non-text body and tags", () => {
    expect(parseReviewInput({ rating: 4, body: 5 })).toMatchObject({ ok: false });
    expect(parseReviewInput({ rating: 4, tags: "fast" })).toMatchObject({ ok: false });
    expect(parseReviewInput({ rating: 4, tags: [1] })).toMatchObject({ ok: false });
  });
});

describe("orderIsDelivered", () => {
  it("accepts any of the delivery signals", () => {
    expect(orderIsDelivered(order())).toBe(true);
    expect(orderIsDelivered(order({ fulfillmentStatus: "shipped", deliveryConfirmedAt: new Date() }))).toBe(true);
    expect(orderIsDelivered(order({ fulfillmentStatus: "shipped", status: "completed" }))).toBe(true);
    expect(orderIsDelivered(order({ fulfillmentStatus: "shipped", status: "delivered" }))).toBe(true);
  });
  it("rejects in-transit orders", () => {
    expect(orderIsDelivered(order({ fulfillmentStatus: "in_transit", status: "shipped" }))).toBe(false);
  });
});

describe("reviewEligibility", () => {
  it("allows the buyer of a paid, delivered, unreviewed order", () => {
    expect(reviewEligibility(order(), "buyer", false)).toEqual({ canReview: true, reason: null });
  });
  it("blocks everyone else with a reason", () => {
    expect(reviewEligibility(order(), "other", false).reason).toBe("not_buyer");
    expect(reviewEligibility(order(), "buyer", true).reason).toBe("already_reviewed");
    expect(reviewEligibility(order({ paymentStatus: "refunded" }), "buyer", false).reason).toBe("not_paid");
    expect(reviewEligibility(order({ fulfillmentStatus: "shipped", status: "shipped" }), "buyer", false).reason).toBe("not_delivered");
  });
});

describe("summaryFromDistribution", () => {
  it("returns null average with no reviews", () => {
    expect(summaryFromDistribution({})).toEqual({ count: 0, average: null, distribution: [0, 0, 0, 0, 0] });
  });
  it("averages to one decimal", () => {
    expect(summaryFromDistribution({ 5: 3, 4: 1 })).toEqual({ count: 4, average: 4.8, distribution: [3, 1, 0, 0, 0] });
    expect(summaryFromDistribution({ 5: 1, 1: 1 }).average).toBe(3);
  });
});
