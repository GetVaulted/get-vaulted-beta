/** Prisma include for listing rows that need seller shipping / Stripe readiness. */
export const listingWithSellerFulfillmentInclude = {
  seller: {
    select: {
      id: true,
      email: true,
      emailVerified: true,
      username: true,
      sellerLevel: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      shipFromStreet: true,
      shipFromCity: true,
      shipFromState: true,
      shipFromZip: true,
      shipFromCountry: true,
    },
  },
  images: true as const,
} as const;
