import { describe, expect, it } from "vitest";
import {
  buildListingCommerceDiagnostics,
  resolveOrderCommerceSnapshot,
  resolveLayawayCommerceSnapshot,
} from "@/lib/marketplace/commerce-state";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import { PAYMENT_PAID } from "@/services/payments";

describe("commerce-state", () => {
  it("paid in-transit order appears in seller fulfillment bucket", () => {
    const snap = resolveOrderCommerceSnapshot({
      id: "ord_1",
      listingId: "listing_1",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      status: "shipped",
      paymentStatus: PAYMENT_PAID,
      fulfillmentStatus: "processing",
      listingStatus: "sold",
      layawayStatus: "active",
    });
    expect(snap.appearsInSellerOrdersApi).toBe(true);
    expect(snap.sellerBucket).toBe("fulfillment");
  });

  it("in-progress layaway order is not seller fulfillment", () => {
    const snap = resolveOrderCommerceSnapshot({
      id: "ord_2",
      listingId: "listing_2",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      status: "pending",
      paymentStatus: PAYMENT_LAYAWAY_ACTIVE,
      fulfillmentStatus: "pending",
      listingStatus: "layaway_reserved",
      layawayStatus: "active",
      remainingBalanceUsd: 200,
    });
    expect(snap.appearsInSellerOrdersApi).toBe(false);
    expect(snap.sellerBucket).toBe("active_layaway");
  });

  it("sold listing with stale active layaway is not active layaway list row", () => {
    const snap = resolveLayawayCommerceSnapshot({
      id: "lay_1",
      listingId: "listing_1",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      status: "active",
      dueAt: new Date(Date.now() + 86_400_000),
      remainingBalanceUsd: 100,
      orderPaymentStatus: PAYMENT_PAID,
      listingStatus: "sold",
    });
    expect(snap.appearsInActiveLayawayList).toBe(false);
    expect(snap.sellerBucket).toBe("fulfillment");
  });

  it("flags paid order + active layaway conflict", () => {
    const diagnostics = buildListingCommerceDiagnostics({
      listing: { id: "listing_1", status: "sold", sellerId: "seller_1" },
      orders: [
        {
          id: "ord_1",
          listingId: "listing_1",
          buyerId: "buyer_1",
          sellerId: "seller_1",
          status: "shipped",
          paymentStatus: PAYMENT_PAID,
          fulfillmentStatus: "processing",
          listingStatus: "sold",
          layawayStatus: "active",
        },
      ],
      layaways: [
        {
          id: "lay_1",
          listingId: "listing_1",
          buyerId: "buyer_1",
          sellerId: "seller_1",
          status: "active",
          dueAt: new Date(Date.now() + 86_400_000),
          remainingBalanceUsd: 50,
          orderPaymentStatus: PAYMENT_PAID,
          listingStatus: "sold",
        },
      ],
    });
    expect(diagnostics.conflicts).not.toContain("PAID_ORDER_AND_ACTIVE_LAYAWAY");
    expect(diagnostics.orders[0]?.appearsInSellerOrdersApi).toBe(true);
    expect(diagnostics.layaways[0]?.appearsInActiveLayawayList).toBe(false);
  });

  it("flags conflict when layaway still appears active with paid order", () => {
    const diagnostics = buildListingCommerceDiagnostics({
      listing: { id: "listing_1", status: "sold", sellerId: "seller_1" },
      orders: [
        {
          id: "ord_1",
          listingId: "listing_1",
          buyerId: "buyer_1",
          sellerId: "seller_1",
          status: "paid",
          paymentStatus: PAYMENT_PAID,
          fulfillmentStatus: "pending",
          listingStatus: "sold",
        },
      ],
      layaways: [
        {
          id: "lay_1",
          listingId: "listing_1",
          buyerId: "buyer_1",
          sellerId: "seller_1",
          status: "active",
          dueAt: new Date(Date.now() + 86_400_000),
          remainingBalanceUsd: 50,
          orderPaymentStatus: PAYMENT_LAYAWAY_ACTIVE,
          listingStatus: "layaway_reserved",
        },
      ],
    });
    expect(diagnostics.conflicts).toContain("PAID_ORDER_AND_ACTIVE_LAYAWAY");
  });
});
