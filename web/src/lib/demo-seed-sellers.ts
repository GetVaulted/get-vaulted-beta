import type { Prisma } from "@/generated/prisma/client";
import { isScreenshotDemoSellerEmail } from "@/lib/screenshot-demo-seed";

/**
 * Hidden from public buyer surfaces (browse, featured, trade picker, live directory):
 * - Prisma seed: `seed+*@getvaulted.internal`
 * - QA live seed: `qa_live_seller_*@test.internal`
 * - Vitest integration tests: `*@test.internal` (e.g. sellerlr → "Integration listing")
 * - Screenshot demo: `screenshots.*@getvaultedtest.com`
 */

export const DEMO_SEED_SELLER_EMAIL_SUFFIX = "@getvaulted.internal";
export const INTEGRATION_TEST_EMAIL_SUFFIX = "@test.internal";

export function isDemoSeedSellerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.endsWith(DEMO_SEED_SELLER_EMAIL_SUFFIX);
}

export function isIntegrationTestSellerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(INTEGRATION_TEST_EMAIL_SUFFIX);
}

/** Matches `ALLOW_QA_LIVE_SEED=1` / `seed-live-auction-qa.ts` seller rows only (not all `@test.internal`). */
export function isQaLiveAuctionSeedSellerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower.startsWith("qa_live_seller_") && lower.endsWith(INTEGRATION_TEST_EMAIL_SUFFIX);
}

export function isHiddenFixtureSellerEmail(email: string | null | undefined): boolean {
  return (
    isDemoSeedSellerEmail(email) ||
    isIntegrationTestSellerEmail(email) ||
    isQaLiveAuctionSeedSellerEmail(email) ||
    isScreenshotDemoSellerEmail(email)
  );
}

/** Prisma fragment: listing/live-room `seller` must be a real storefront account for public catalog queries. */
export function prismaSellerVisibleOnPublicMarketplace(): Prisma.UserWhereInput {
  return {
    AND: [
      { email: { not: { endsWith: DEMO_SEED_SELLER_EMAIL_SUFFIX } } },
      { email: { not: { endsWith: INTEGRATION_TEST_EMAIL_SUFFIX } } },
      { email: { not: { startsWith: "screenshots." } } },
    ],
  };
}
