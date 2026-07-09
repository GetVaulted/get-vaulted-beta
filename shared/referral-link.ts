/**
 * Referral link building, shared between web and mobile.
 *
 * Each member gets a unique secret `referralCode` (stored on `User.referralCode`) — not their
 * public username — so links cannot be guessed or swapped by changing the URL tail.
 *
 * `/join?ref=<code>` is the canonical path: on web it resolves to signup (see `web/src/app/join/page.tsx`);
 * on mobile it's a universal-link entry into sign-up with the code pre-filled when installed.
 *
 * Legacy username-based `?ref=<username>` links still attribute correctly during transition.
 */

export const REFERRAL_JOIN_PATH = "/join";

/** `/join?ref=<referralCode>` — path + query only, no origin. */
export function buildReferralJoinPath(referralCode: string): string {
  const normalized = referralCode.trim().toUpperCase();
  if (!normalized) return REFERRAL_JOIN_PATH;
  return `${REFERRAL_JOIN_PATH}?ref=${encodeURIComponent(normalized)}`;
}

/** Full shareable URL, e.g. `https://shopgetvaulted.com/join?ref=K7H3N9Q2MW`. */
export function buildReferralJoinUrl(referralCode: string, siteBaseUrl: string): string {
  const base = siteBaseUrl.trim().replace(/\/+$/, "") || "https://shopgetvaulted.com";
  return `${base}${buildReferralJoinPath(referralCode)}`;
}
