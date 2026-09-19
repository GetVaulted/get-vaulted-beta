export type LiveShowReadinessChecks = {
  hasStripeAccount: boolean;
  stripeChargesEnabled: boolean;
  /** Hosted Connect submitted; pending_verification OK for wizard / HQ unlock. */
  stripePayoutSubmitted: boolean;
  hasShipFromAddress: boolean;
  /** Seller chose PayPal and verified payout email — satisfies payout gate without Stripe. */
  paypalPayoutReady: boolean;
  /** Server feature flag: PayPal credentials present and seller payouts not disabled. */
  paypalSellerPayoutsEnabled: boolean;
  preferredSellerPayoutProcessor: "STRIPE" | "PAYPAL";
  hasShippoConfigured: boolean;
  /** When high-value alternate checkout is required for live, seller must have linked the provider account (DB field). */
  alternateCheckoutSellerReady: boolean;
  hasAtLeastOneListingWithShippingProfile: boolean;
};

export type LiveShowReadiness = {
  canGoLive: boolean;
  issues: string[];
  checks: LiveShowReadinessChecks;
};
