import { describe, expect, it } from "vitest";
import {
  isStripePayoutSetupSubmitted,
  isStripePayoutSetupSubmittedFromAccount,
} from "@/lib/stripe-payout-submitted";

describe("isStripePayoutSetupSubmitted", () => {
  it("is true when onboarding is fully complete", () => {
    expect(
      isStripePayoutSetupSubmitted({
        hasStripeAccount: true,
        stripeOnboardingComplete: true,
      }),
    ).toBe(true);
  });

  it("is true while Stripe is verifying (pending_verification, no currently_due)", () => {
    expect(
      isStripePayoutSetupSubmitted({
        hasStripeAccount: true,
        stripeOnboardingComplete: false,
        currentlyDue: [],
        pendingVerification: ["individual.verification.document"],
      }),
    ).toBe(true);
  });

  it("is false when Stripe still needs fields (currently_due)", () => {
    expect(
      isStripePayoutSetupSubmitted({
        hasStripeAccount: true,
        stripeOnboardingComplete: false,
        currentlyDue: ["individual.ssn_last_4"],
        pendingVerification: [],
      }),
    ).toBe(false);
  });

  it("is false with only an account id and empty requirements", () => {
    expect(
      isStripePayoutSetupSubmitted({
        hasStripeAccount: true,
        stripeOnboardingComplete: false,
        currentlyDue: [],
        pendingVerification: [],
      }),
    ).toBe(false);
  });
});

describe("isStripePayoutSetupSubmittedFromAccount", () => {
  it("matches Connect status payout_setup_submitted", () => {
    expect(
      isStripePayoutSetupSubmittedFromAccount({
        details_submitted: true,
        requirements: { currently_due: [] },
      }),
    ).toBe(true);
    expect(
      isStripePayoutSetupSubmittedFromAccount({
        details_submitted: true,
        requirements: { currently_due: ["business_profile.url"] },
      }),
    ).toBe(false);
  });
});
