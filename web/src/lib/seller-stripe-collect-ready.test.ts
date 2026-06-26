import { describe, expect, it, vi } from "vitest";
import {
  getSellerStripeCollectIssues,
  sellerStripeCollectReady,
} from "@/lib/seller-stripe-collect-ready";

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
}));

const readySeller = {
  stripeAccountId: "acct_1",
  stripeOnboardingComplete: true,
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeRequirementsDue: {
    currentlyDue: [],
    pendingVerification: [],
    eventuallyDue: [],
    disabledReason: null,
  },
};

describe("sellerStripeCollectReady", () => {
  it("accepts a fully ready seller", () => {
    expect(sellerStripeCollectReady(readySeller)).toBe(true);
    expect(getSellerStripeCollectIssues(readySeller)).toEqual([]);
  });

  it("rejects missing Connect account", () => {
    expect(sellerStripeCollectReady({ ...readySeller, stripeAccountId: null })).toBe(false);
  });
});
