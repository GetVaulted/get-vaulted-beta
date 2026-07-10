import { describe, expect, it } from "vitest";
import {
  assertBuyNowAllowed,
  assertLayawayStartAllowed,
  assertMakeOfferAllowed,
  assertTradeOfferListingAllowed,
  CommerceGuardError,
  type ListingCommerceContext,
} from "@/lib/marketplace/commerce-guards";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import { PAYMENT_PAID, PAYMENT_PENDING } from "@/services/payments";

function ctx(partial: Partial<ListingCommerceContext> & Pick<ListingCommerceContext, "listing">): ListingCommerceContext {
  return {
    activeLayaway: null,
    existingOrder: null,
    canonicalStatus: "available",
    ...partial,
  };
}

const baseListing = {
  id: "listing_1",
  sellerId: "seller_1",
  status: "active" as const,
  buyingFormat: "buy_now",
  moderationRemovedAt: null,
  allowOffers: true,
  acceptTradeOffers: true,
  allowLayaway: true,
  priceUsd: 250,
};

describe("commerce-guards", () => {
  it("blocks Buy Now when another buyer has active layaway", () => {
    expect(() =>
      assertBuyNowAllowed(
        ctx({
          listing: baseListing,
          activeLayaway: {
            id: "lay_1",
            buyerId: "buyer_a",
            orderId: "ord_1",
            amountPaidUsd: 100,
            depositAmountUsd: 100,
          },
          canonicalStatus: "layaway_active",
        }),
        "buyer_b",
      ),
    ).toThrow(CommerceGuardError);

    try {
      assertBuyNowAllowed(
        ctx({
          listing: baseListing,
          activeLayaway: {
            id: "lay_1",
            buyerId: "buyer_a",
            orderId: "ord_1",
            amountPaidUsd: 100,
            depositAmountUsd: 100,
          },
          canonicalStatus: "layaway_active",
        }),
        "buyer_b",
      );
    } catch (e) {
      expect(e).toBeInstanceOf(CommerceGuardError);
      expect((e as CommerceGuardError).code).toBe("ITEM_RESERVED_ON_LAYAWAY");
    }
  });

  it("blocks Make Offer when listing is on layaway", () => {
    expect(() =>
      assertMakeOfferAllowed(
        ctx({
          listing: { ...baseListing, status: "layaway_reserved", allowOffers: false },
          activeLayaway: {
            id: "lay_1",
            buyerId: "buyer_a",
            orderId: "ord_1",
            amountPaidUsd: 50,
            depositAmountUsd: 50,
          },
          canonicalStatus: "layaway_active",
        }),
        "buyer_b",
      ),
    ).toThrow(CommerceGuardError);
  });

  it("blocks Trade Offer when active layaway exists", () => {
    expect(() =>
      assertTradeOfferListingAllowed(
        ctx({
          listing: baseListing,
          activeLayaway: {
            id: "lay_1",
            buyerId: "buyer_a",
            orderId: "ord_1",
            amountPaidUsd: 0,
            depositAmountUsd: 100,
          },
          canonicalStatus: "layaway_reserved",
        }),
        "buyer_b",
      ),
    ).toThrow(CommerceGuardError);
  });

  it("blocks second layaway when active layaway exists", () => {
    expect(() =>
      assertLayawayStartAllowed(
        ctx({
          listing: baseListing,
          activeLayaway: {
            id: "lay_1",
            buyerId: "buyer_a",
            orderId: "ord_1",
            amountPaidUsd: 0,
            depositAmountUsd: 100,
          },
          canonicalStatus: "layaway_reserved",
        }),
        "buyer_b",
      ),
    ).toThrow(CommerceGuardError);
  });

  it("allows same buyer to pay layaway balance path (blocks Buy Now with payoff hint)", () => {
    expect(() =>
      assertBuyNowAllowed(
        ctx({
          listing: { ...baseListing, status: "layaway_reserved" },
          activeLayaway: {
            id: "lay_1",
            buyerId: "buyer_a",
            orderId: "ord_1",
            amountPaidUsd: 100,
            depositAmountUsd: 100,
          },
          existingOrder: {
            id: "ord_1",
            buyerId: "buyer_a",
            paymentStatus: PAYMENT_LAYAWAY_ACTIVE,
            paymentMethod: "layaway",
          },
          canonicalStatus: "layaway_active",
        }),
        "buyer_a",
      ),
    ).toThrow(CommerceGuardError);

    try {
      assertBuyNowAllowed(
        ctx({
          listing: { ...baseListing, status: "layaway_reserved" },
          activeLayaway: {
            id: "lay_1",
            buyerId: "buyer_a",
            orderId: "ord_1",
            amountPaidUsd: 100,
            depositAmountUsd: 100,
          },
          existingOrder: {
            id: "ord_1",
            buyerId: "buyer_a",
            paymentStatus: PAYMENT_LAYAWAY_ACTIVE,
            paymentMethod: "layaway",
          },
          canonicalStatus: "layaway_active",
        }),
        "buyer_a",
      );
    } catch (e) {
      expect((e as CommerceGuardError).code).toBe("USE_LAYAWAY_PAYOFF");
    }
  });

  it("blocks Buy Now on sold listing", () => {
    expect(() =>
      assertBuyNowAllowed(
        ctx({
          listing: { ...baseListing, status: "sold" },
          existingOrder: {
            id: "ord_paid",
            buyerId: "buyer_b",
            paymentStatus: PAYMENT_PAID,
            paymentMethod: "stripe",
          },
          canonicalStatus: "sold",
        }),
        "buyer_c",
      ),
    ).toThrow(CommerceGuardError);
  });

  it("blocks Buy Now when another buyer checkout is pending", () => {
    expect(() =>
      assertBuyNowAllowed(
        ctx({
          listing: baseListing,
          existingOrder: {
            id: "ord_pending",
            buyerId: "buyer_a",
            paymentStatus: PAYMENT_PENDING,
            paymentMethod: "stripe",
          },
        }),
        "buyer_b",
      ),
    ).toThrow(CommerceGuardError);
  });

  it("blocks Buy Now and layaway on trade-only listings", () => {
    const tradeOnlyListing = {
      ...baseListing,
      allowOffers: false,
      allowLayaway: false,
      acceptTradeOffers: true,
      priceUsd: 1,
    };
    expect(() => assertBuyNowAllowed(ctx({ listing: tradeOnlyListing }), "buyer_a")).toThrow(CommerceGuardError);
    expect(() => assertLayawayStartAllowed(ctx({ listing: tradeOnlyListing }), "buyer_a")).toThrow(CommerceGuardError);
  });
});
