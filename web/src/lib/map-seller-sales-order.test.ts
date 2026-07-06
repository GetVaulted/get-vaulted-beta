import { describe, expect, it } from "vitest";
import { mapSellerSalesOrderForApi, type SellerSalesOrderRowInput, type SellerSalesOrderUser } from "@/lib/map-seller-sales-order";

const baseUser: SellerSalesOrderUser = {
  stripeAccountId: "acct_1",
  stripeOnboardingComplete: true,
  shipFromName: "Seller",
  shipFromStreet: "1 Main St",
  shipFromCity: "Austin",
  shipFromState: "TX",
  shipFromZip: "78701",
  shipFromCountry: "US",
};

function baseOrder(overrides: Partial<SellerSalesOrderRowInput> = {}): SellerSalesOrderRowInput {
  return {
    id: "order_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    totalUsd: 105,
    itemPriceUsd: 100,
    shippingPriceUsd: 5,
    taxUsd: 0,
    taxAmountCents: 0,
    status: "paid",
    paymentStatus: "paid",
    fulfillmentStatus: "unfulfilled",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    shipRecipientName: "Buyer",
    shipAddress: "2 Elm St",
    shipCity: "Dallas",
    shipState: "TX",
    shipZip: "75201",
    shipCountry: "US",
    carrier: null,
    service: null,
    trackingNumber: null,
    trackingUrl: null,
    labelUrl: null,
    shippoTransactionId: null,
    shippingStatus: null,
    labelCreatedAt: null,
    shippedAt: null,
    paymentDeadlineAt: null,
    payoutStatus: "held",
    payoutBlockedReason: null,
    payoutHoldUntil: null,
    payoutReserveAmountCents: 0,
    deliveryConfirmedAt: null,
    payoutMethod: "standard",
    liveShippingSession: null,
    listing: {
      id: "listing_1",
      title: "Charizard PSA 10",
      status: "sold",
      isCompanyListing: false,
      images: [],
    },
    buyer: { username: "buyer_1" },
    layaway: null,
    ...overrides,
  };
}

describe("mapSellerSalesOrderForApi — live-show fee-tier stability after a show ends", () => {
  it("uses the live in-progress GMV counter while the show is still live", () => {
    const order = baseOrder({
      liveShippingSession: {
        liveShowId: "room_1",
        liveShow: { completedSalesGmvUsd: 3500, finalSalesGmvUsd: null, status: "live" },
      },
    });
    const mapped = mapSellerSalesOrderForApi(baseUser, order);
    expect(mapped.platformFeePercent).toBeLessThan(8);
  });

  it("keeps the tiered fee percent stable after the show ends, using the persisted final GMV", () => {
    const liveOrder = baseOrder({
      liveShippingSession: {
        liveShowId: "room_1",
        liveShow: { completedSalesGmvUsd: 3500, finalSalesGmvUsd: null, status: "live" },
      },
    });
    const liveResult = mapSellerSalesOrderForApi(baseUser, liveOrder);

    // Same order, same show, after it ended: completedSalesGmvUsd has been reset to 0, but
    // finalSalesGmvUsd preserves the true total the show reached.
    const endedOrder = baseOrder({
      liveShippingSession: {
        liveShowId: "room_1",
        liveShow: { completedSalesGmvUsd: 0, finalSalesGmvUsd: 3500, status: "ended" },
      },
    });
    const endedResult = mapSellerSalesOrderForApi(baseUser, endedOrder);

    expect(endedResult.platformFeePercent).toBe(liveResult.platformFeePercent);
    expect(endedResult.platformFeeEstimateUsd).toBe(liveResult.platformFeeEstimateUsd);
    expect(endedResult.payoutEstimateUsd).toBe(liveResult.payoutEstimateUsd);
  });

  it("falls back to the worst (base) tier only when no final snapshot was ever recorded", () => {
    const order = baseOrder({
      liveShippingSession: {
        liveShowId: "room_1",
        liveShow: { completedSalesGmvUsd: 0, finalSalesGmvUsd: null, status: "ended" },
      },
    });
    const mapped = mapSellerSalesOrderForApi(baseUser, order);
    expect(mapped.platformFeePercent).toBe(8);
  });
});
