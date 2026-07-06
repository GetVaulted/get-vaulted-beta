/**
 * Referral link building, shared between web and mobile.
 *
 * A referral code is just the referrer's username (usernames are immutable in this app), so
 * there's no separate generated-code system to manage. `/join?ref=<username>` is the canonical
 * path: on web it resolves directly to the signup page (see `web/src/app/join/page.tsx`); on
 * mobile it's a universal-link entry that deep-links straight into the sign-up screen with the
 * code pre-filled when the app is already installed (see `mobile/src/navigation/linkingConfig.ts`),
 * and otherwise falls back to opening the web signup page in a browser.
 */

export const REFERRAL_JOIN_PATH = "/join";

/** `/join?ref=<username>` — path + query only, no origin. */
export function buildReferralJoinPath(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return REFERRAL_JOIN_PATH;
  return `${REFERRAL_JOIN_PATH}?ref=${encodeURIComponent(normalized)}`;
}

/** Full shareable URL, e.g. `https://shopgetvaulted.com/join?ref=jdoe`. */
export function buildReferralJoinUrl(username: string, siteBaseUrl: string): string {
  const base = siteBaseUrl.trim().replace(/\/+$/, "") || "https://shopgetvaulted.com";
  return `${base}${buildReferralJoinPath(username)}`;
}
