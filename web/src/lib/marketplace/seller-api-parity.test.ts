import { describe, expect, it } from "vitest";
import { isActiveLayawayListRow, orderQualifiesForSellerFulfillment } from "@/lib/marketplace/layaway-commerce-state";
import { resolveOrderCommerceSnapshot } from "@/lib/marketplace/commerce-state";
import { sellerFulfillmentOrdersWhere } from "@/lib/seller-fulfillment-orders";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import { PAYMENT_PAID } from "@/services/payments";

/** Ensures mobile/web seller clients see the same fulfillment eligibility from shared resolvers. */
describe("seller API parity (web + mobile clients)", () => {
  it("paid buy-now order is included in seller fulfillment resolver", () => {
    const order = {
      id: "ord_1",
      listingId: "listing_1",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      status: "shipped",
      paymentStatus: PAYMENT_PAID,
      fulfillmentStatus: "processing",
      listingStatus: "sold",
      layawayStatus: "active" as const,
      remainingBalanceUsd: 100,
    };
    expect(orderQualifiesForSellerFulfillment(order)).toBe(true);
    expect(resolveOrderCommerceSnapshot(order).appearsInSellerOrdersApi).toBe(true);
  });

  it("in-progress layaway order is excluded from seller fulfillment resolver", () => {
    const order = {
      id: "ord_2",
      listingId: "listing_2",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      status: "pending",
      paymentStatus: PAYMENT_LAYAWAY_ACTIVE,
      fulfillmentStatus: "pending",
      listingStatus: "layaway_reserved",
      layawayStatus: "active" as const,
      remainingBalanceUsd: 200,
    };
    expect(orderQualifiesForSellerFulfillment(order)).toBe(false);
    expect(resolveOrderCommerceSnapshot(order).appearsInSellerOrdersApi).toBe(false);
  });

  it("sellerFulfillmentOrdersWhere includes paid orders even with stale active layaway relation", () => {
    const where = sellerFulfillmentOrdersWhere("seller_1");
    expect(where.OR).toBeDefined();
    const paidBranch = (where.OR as Array<Record<string, unknown>>)[0];
    expect(paidBranch).toEqual({ paymentStatus: PAYMENT_PAID });
  });

  it("seller layaway list excludes sold listing with stale active layaway row", () => {
    expect(
      isActiveLayawayListRow({
        status: "active",
        dueAt: new Date(),
        remainingBalanceUsd: 100,
        orderPaymentStatus: PAYMENT_LAYAWAY_ACTIVE,
        listingStatus: "sold",
        amountPaidUsd: 50,
        depositAmountUsd: 50,
      }),
    ).toBe(false);
  });
});
