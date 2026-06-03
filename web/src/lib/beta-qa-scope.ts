/**
 * Scope guards for beta QA reset / cleanup scripts.
 * Only touches known QA clutter — never production-style accounts on beta.
 */

export const EXPECTED_BETA_PROJECT_REF = "xkaaicokjgmpbctfermj";

/** Deployed beta Next.js API — used by reset/IVS preflight guards. */
export const EXPECTED_BETA_API_HOST = "https://beta.shopgetvaulted.com";

export const BETA_QA_SELLER_EMAIL = "sellerqa@getvaultedtest.com";
export const BETA_QA_BUYER_EMAIL = "buyerqa@getvaultedtest.com";
export const BETA_QA_ADMIN_EMAIL = "adminqa@getvaultedtest.com";
export const BETA_QA_SELLER_USERNAME = "sellerqa";
export const BETA_QA_BUYER_USERNAME = "buyerqa";
export const BETA_QA_ADMIN_USERNAME = "adminqa";

export const BETA_QA_CANONICAL_EMAILS = [
  BETA_QA_SELLER_EMAIL,
  BETA_QA_BUYER_EMAIL,
  BETA_QA_ADMIN_EMAIL,
] as const;

/** Legacy beta accounts to archive (hide commerce) but not delete. */
export const LEGACY_QA_USERNAMES = ["brysmith31"] as const;

export const DEMO_SEED_EMAIL_SUFFIX = "@getvaulted.internal";

export function isCanonicalBetaQaEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return (BETA_QA_CANONICAL_EMAILS as readonly string[]).includes(lower);
}

export function isDemoSeedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.endsWith(DEMO_SEED_EMAIL_SUFFIX);
}

export function isQaLiveAuctionSeedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower.startsWith("qa_live_") && lower.endsWith("@test.internal");
}

/** Disposable rows from prisma seed / qa-live-auction scripts — safe to delete entirely. */
export function isDeletableFixtureEmail(email: string | null | undefined): boolean {
  return isDemoSeedEmail(email) || isQaLiveAuctionSeedEmail(email);
}

/**
 * Non-canonical QA clutter on beta (listings/rooms should be archived or user deleted).
 * Does NOT match real storefront accounts (e.g. personal gmail on beta).
 */
export function isQaClutterAccount(email: string | null | undefined, username: string): boolean {
  if (isCanonicalBetaQaEmail(email)) return false;
  if (isDeletableFixtureEmail(email)) return true;
  if (email?.toLowerCase().endsWith("@getvaultedtest.com")) return true;
  const un = username.toLowerCase();
  return (LEGACY_QA_USERNAMES as readonly string[]).includes(un);
}
