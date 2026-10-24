import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/escrow-config", () => ({ isEscrowConfigured: () => false, isEscrowFeaturesEnabled: () => false }));
vi.mock("@/lib/seller-payout-rail", () => ({
  effectiveSellerPayoutProcessor: () => "STRIPE",
  isSellerPayoutRailReady: () => true,
  sellerPayoutRailNotReadyMessage: () => "",
}));
vi.mock("@/lib/seller-shipping-readiness", () => ({
  hasCompleteSellerShipFrom: () => true,
  sellerNeedsShipFromPhoneOnly: () => false,
}));
vi.mock("@/lib/shippo", () => ({ isShippoConfigured: () => true }));
vi.mock("@/lib/seller-approval", () => ({ getSellerApprovalIssue: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/stripe", () => ({ isStripeConfigured: () => true }));
vi.mock("@/lib/paypal", () => ({ isPayPalSellerPayoutsEnabled: () => false }));
vi.mock("@/lib/stripe-connect-status-response", () => ({ parseRequirementsDue: () => null }));
vi.mock("@/lib/stripe-payout-submitted", () => ({ isStripePayoutSetupSubmitted: () => true }));

import { SELLER_LOCK_PUBLIC_MESSAGE } from "@/lib/seller-lock";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";

function fakeDb(userOverrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        sellerLockedAt: null,
        stripeAccountId: "acct_1",
        stripeOnboardingComplete: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeRequirementsDue: null,
        preferredSellerPayoutProcessor: "STRIPE",
        paypalPayoutEmail: null,
        paypalPayoutVerifiedAt: null,
        defaultShipFromAddressId: "addr_1",
        trustapUserId: null,
        defaultShipFromAddress: null,
        ...userOverrides,
      }),
    },
    listing: {
      findFirst: vi.fn().mockResolvedValue({
        shippingCategory: "cards",
        shippingBaseWeightOz: 4,
        shippingIncrementalWeightOz: 1,
      }),
    },
  } as any;
}

describe("getSellerLiveReadiness — admin seller lock", () => {
  it("a fully set-up seller can go live", async () => {
    const r = await getSellerLiveReadiness("seller_1", fakeDb());
    expect(r.issues).toEqual([]);
    expect(r.canGoLive).toBe(true);
  });

  it("a locked seller cannot go live, even when everything else is ready", async () => {
    const r = await getSellerLiveReadiness("seller_1", fakeDb({ sellerLockedAt: new Date() }));
    expect(r.canGoLive).toBe(false);
    expect(r.issues).toContain(SELLER_LOCK_PUBLIC_MESSAGE);
  });
});
