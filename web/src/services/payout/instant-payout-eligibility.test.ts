import { describe, expect, it } from "vitest";
import { EscrowStatus, InstantPayoutStatus, OrderPayoutStatus } from "@/generated/prisma/enums";
import {
  evaluateOrderInstantPayoutEligibility,
  evaluateSellerInstantPayoutEligibility,
  SUSPICIOUS_ORDER_VALUE_USD,
  type SellerPayoutEligibilitySlice,
} from "@/services/payout/instant-payout-eligibility";

function baseSeller(overrides: Partial<SellerPayoutEligibilitySlice> = {}): SellerPayoutEligibilitySlice {
  return {
    id: "seller-1",
    suspendedAt: null,
    sellerSetupWizardCompletedAt: new Date(),
    stripeAccountId: "acct_123",
    stripeOnboardingComplete: true,
    stripePayoutsEnabled: true,
    shipFromStreet: "1 Main St",
    shipFromCity: "Austin",
    shipFromState: "TX",
    shipFromZip: "78701",
    shipFromCountry: "US",
    defaultShipFromAddressId: null,
    instantPayoutEligible: false,
    instantPayoutStatus: InstantPayoutStatus.ineligible,
    instantPayoutOverrideByAdmin: false,
    payoutRiskLevel: "low",
    payoutHoldDays: 7,
    payoutReservePercent: 0,
    ...overrides,
  };
}

const emptyStats = { recentPaidOrders: 0, ordersWithTracking: 0, disputedOrRefunded: 0 };

describe("evaluateSellerInstantPayoutEligibility", () => {
  it("marks fully qualified seller as eligible", () => {
    const r = evaluateSellerInstantPayoutEligibility(baseSeller(), emptyStats);
    expect(r.eligible).toBe(true);
    expect(r.status).toBe(InstantPayoutStatus.eligible);
  });

  it("rejects seller without Stripe payout account", () => {
    const r = evaluateSellerInstantPayoutEligibility(
      baseSeller({ stripePayoutsEnabled: false }),
      emptyStats,
    );
    expect(r.eligible).toBe(false);
    expect(r.requirementsFailed).toContain("stripe_payout_account_not_verified");
  });

  it("honors admin override when Stripe is ready", () => {
    const r = evaluateSellerInstantPayoutEligibility(
      baseSeller({
        instantPayoutStatus: InstantPayoutStatus.admin_override,
        instantPayoutOverrideByAdmin: true,
        shipFromStreet: null,
      }),
      emptyStats,
    );
    expect(r.eligible).toBe(true);
    expect(r.status).toBe(InstantPayoutStatus.admin_override);
  });

  it("blocks admin override without Stripe account", () => {
    const r = evaluateSellerInstantPayoutEligibility(
      baseSeller({
        instantPayoutStatus: InstantPayoutStatus.admin_override,
        instantPayoutOverrideByAdmin: true,
        stripeAccountId: null,
        stripeOnboardingComplete: false,
      }),
      emptyStats,
    );
    expect(r.eligible).toBe(false);
    expect(r.requirementsFailed).toContain("admin_override_blocked_missing_stripe");
  });
});

describe("evaluateOrderInstantPayoutEligibility", () => {
  it("allows instant payout for eligible seller with delivered tracked order", () => {
    const seller = baseSeller({ instantPayoutEligible: true, instantPayoutStatus: InstantPayoutStatus.eligible });
    const sellerEval = evaluateSellerInstantPayoutEligibility(seller, emptyStats);
    const r = evaluateOrderInstantPayoutEligibility({
      seller,
      sellerEval,
      order: {
        id: "ord-1",
        sellerId: seller.id,
        paymentStatus: "paid",
        paymentMethod: "stripe",
        fulfillmentStatus: "delivered",
        escrowStatus: null,
        escrowReleasePaused: false,
        trackingNumber: "1Z999",
        shippingStatus: "DELIVERED",
        itemPriceUsd: 100,
        totalUsd: 110,
        payoutStatus: OrderPayoutStatus.held,
        payoutBlockedReason: null,
      },
    });
    expect(r.instantPayoutAllowed).toBe(true);
    expect(r.recommendedStatus).toBe(OrderPayoutStatus.instant_payout_ready);
  });

  it("holds payout for ineligible seller after delivery", () => {
    const seller = baseSeller({ instantPayoutStatus: InstantPayoutStatus.suspended });
    const sellerEval = evaluateSellerInstantPayoutEligibility(seller, emptyStats);
    const r = evaluateOrderInstantPayoutEligibility({
      seller,
      sellerEval,
      order: {
        id: "ord-2",
        sellerId: seller.id,
        paymentStatus: "paid",
        paymentMethod: "stripe",
        fulfillmentStatus: "delivered",
        escrowStatus: null,
        escrowReleasePaused: false,
        trackingNumber: "1Z999",
        shippingStatus: "DELIVERED",
        itemPriceUsd: 50,
        totalUsd: 55,
        payoutStatus: OrderPayoutStatus.held,
        payoutBlockedReason: null,
      },
    });
    expect(r.instantPayoutAllowed).toBe(false);
    expect(r.disqualifiers).toContain("admin_disabled_instant_payout");
  });

  it("blocks payout when tracking is missing", () => {
    const seller = baseSeller({ instantPayoutEligible: true, instantPayoutStatus: InstantPayoutStatus.eligible });
    const sellerEval = evaluateSellerInstantPayoutEligibility(seller, emptyStats);
    const r = evaluateOrderInstantPayoutEligibility({
      seller,
      sellerEval,
      order: {
        id: "ord-3",
        sellerId: seller.id,
        paymentStatus: "paid",
        paymentMethod: "stripe",
        fulfillmentStatus: "delivered",
        escrowStatus: null,
        escrowReleasePaused: false,
        trackingNumber: null,
        shippingStatus: null,
        itemPriceUsd: 50,
        totalUsd: 55,
        payoutStatus: OrderPayoutStatus.held,
        payoutBlockedReason: null,
      },
    });
    expect(r.instantPayoutAllowed).toBe(false);
    expect(r.recommendedStatus).toBe(OrderPayoutStatus.blocked);
    expect(r.disqualifiers).toContain("missing_tracking");
  });

  it("blocks disputed escrow orders", () => {
    const seller = baseSeller({ instantPayoutEligible: true, instantPayoutStatus: InstantPayoutStatus.eligible });
    const sellerEval = evaluateSellerInstantPayoutEligibility(seller, emptyStats);
    const r = evaluateOrderInstantPayoutEligibility({
      seller,
      sellerEval,
      order: {
        id: "ord-4",
        sellerId: seller.id,
        paymentStatus: "paid",
        paymentMethod: "escrow",
        fulfillmentStatus: "delivered",
        escrowStatus: EscrowStatus.disputed,
        escrowReleasePaused: false,
        trackingNumber: "1Z999",
        shippingStatus: "DELIVERED",
        itemPriceUsd: 50,
        totalUsd: 55,
        payoutStatus: OrderPayoutStatus.held,
        payoutBlockedReason: null,
      },
    });
    expect(r.disqualifiers).toContain("buyer_dispute");
    expect(r.recommendedStatus).toBe(OrderPayoutStatus.blocked);
  });

  it("flags suspicious order value for manual review", () => {
    const seller = baseSeller({ instantPayoutEligible: true, instantPayoutStatus: InstantPayoutStatus.eligible });
    const sellerEval = evaluateSellerInstantPayoutEligibility(seller, emptyStats);
    const r = evaluateOrderInstantPayoutEligibility({
      seller,
      sellerEval,
      order: {
        id: "ord-5",
        sellerId: seller.id,
        paymentStatus: "paid",
        paymentMethod: "stripe",
        fulfillmentStatus: "delivered",
        escrowStatus: null,
        escrowReleasePaused: false,
        trackingNumber: "1Z999",
        shippingStatus: "DELIVERED",
        itemPriceUsd: SUSPICIOUS_ORDER_VALUE_USD,
        totalUsd: SUSPICIOUS_ORDER_VALUE_USD + 50,
        payoutStatus: OrderPayoutStatus.held,
        payoutBlockedReason: null,
      },
    });
    expect(r.disqualifiers).toContain("suspicious_order_value");
    expect(r.recommendedStatus).toBe(OrderPayoutStatus.manual_review);
  });
});
