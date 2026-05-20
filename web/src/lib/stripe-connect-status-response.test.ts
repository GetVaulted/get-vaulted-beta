import { describe, expect, it } from "vitest";
import { sellerCanSellFromConnectSnapshot } from "@/lib/stripe-connect-status-response";

describe("sellerCanSellFromConnectSnapshot", () => {
  it("allows sell when onboarding complete flag is set (legacy DB rows)", () => {
    expect(
      sellerCanSellFromConnectSnapshot({
        stripeAccountId: "acct_1",
        stripeOnboardingComplete: true,
        stripeChargesEnabled: null,
        stripePayoutsEnabled: null,
        onboardingUiStatus: "pending_review",
      }),
    ).toBe(true);
  });

  it("requires charges and payouts when onboarding flag is false", () => {
    expect(
      sellerCanSellFromConnectSnapshot({
        stripeAccountId: "acct_1",
        stripeOnboardingComplete: false,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        onboardingUiStatus: "verified",
      }),
    ).toBe(true);
  });

  it("blocks restricted accounts", () => {
    expect(
      sellerCanSellFromConnectSnapshot({
        stripeAccountId: "acct_1",
        stripeOnboardingComplete: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        onboardingUiStatus: "restricted",
      }),
    ).toBe(false);
  });
});
