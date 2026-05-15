import type { Prisma } from "@/generated/prisma/client";

/**
 * Prisma marketplace seed uses `seed+*@getvaulted.internal`.
 * `scripts/seed-live-auction-qa.ts` uses `qa_live_seller_*@test.internal` + `qaLiveSeller{stamp}`.
 * Neither should appear on public buyer surfaces (browse, featured, trade picker, live directory).
 */

export const DEMO_SEED_SELLER_EMAIL_SUFFIX = "@getvaulted.internal";

export function isDemoSeedSellerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.endsWith(DEMO_SEED_SELLER_EMAIL_SUFFIX);
}

/** Matches `ALLOW_QA_LIVE_SEED=1` / `seed-live-auction-qa.ts` seller rows only (not all `@test.internal`). */
export function isQaLiveAuctionSeedSellerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower.startsWith("qa_live_seller_") && lower.endsWith("@test.internal");
}

export function isHiddenFixtureSellerEmail(email: string | null | undefined): boolean {
  return isDemoSeedSellerEmail(email) || isQaLiveAuctionSeedSellerEmail(email);
}

/** Prisma fragment: listing/live-room `seller` must be a real storefront account for public catalog queries. */
export function prismaSellerVisibleOnPublicMarketplace(): Prisma.UserWhereInput {
  return {
    AND: [
      { email: { not: { endsWith: DEMO_SEED_SELLER_EMAIL_SUFFIX } } },
      {
        NOT: {
          AND: [{ email: { startsWith: "qa_live_seller_" } }, { email: { endsWith: "@test.internal" } }],
        },
      },
    ],
  };
}
