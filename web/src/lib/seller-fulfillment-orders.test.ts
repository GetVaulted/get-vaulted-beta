import { describe, expect, it } from "vitest";
import { isSellerFulfillmentOrder } from "./seller-fulfillment-orders";

describe("isSellerFulfillmentOrder", () => {
  it("excludes in-progress layaway orders", () => {
    expect(isSellerFulfillmentOrder({ paymentStatus: "layaway_active", layawayStatus: "active" })).toBe(false);
    expect(isSellerFulfillmentOrder({ paymentStatus: "layaway_active", layawayStatus: null })).toBe(false);
  });

  it("includes paid marketplace orders even when layaway row is stale active", () => {
    expect(isSellerFulfillmentOrder({ paymentStatus: "paid", layawayStatus: "active", listingStatus: "sold" })).toBe(
      true,
    );
    expect(isSellerFulfillmentOrder({ paymentStatus: "paid", layawayStatus: "completed" })).toBe(true);
    expect(isSellerFulfillmentOrder({ paymentStatus: "paid", layawayStatus: null })).toBe(true);
  });
});
