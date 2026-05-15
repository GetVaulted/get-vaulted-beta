export type LiveShowReadinessChecks = {
  hasStripeAccount: boolean;
  stripeChargesEnabled: boolean;
  hasShippoConfigured: boolean;
  hasShipFromAddress: boolean;
  /** When high-value alternate checkout is required for live, seller must have linked the provider account (DB field). */
  alternateCheckoutSellerReady: boolean;
  hasAtLeastOneListingWithShippingProfile: boolean;
};

export type LiveShowReadiness = {
  canGoLive: boolean;
  issues: string[];
  checks: LiveShowReadinessChecks;
};
