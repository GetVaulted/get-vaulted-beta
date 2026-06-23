/** Public web URLs (policies, support). */

export function getSiteBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_SITE_URL?.trim();
  return (raw?.replace(/\/$/, '') || 'https://shopgetvaulted.com');
}

export const siteUrls = {
  privacy: () => `${getSiteBaseUrl()}/privacy`,
  terms: () => `${getSiteBaseUrl()}/terms`,
  termsSellerObligations: () => `${getSiteBaseUrl()}/terms#seller-obligations`,
  communityGuidelines: () => `${getSiteBaseUrl()}/community-guidelines`,
  reportingSafety: () => `${getSiteBaseUrl()}/reporting-safety`,
  support: () => `${getSiteBaseUrl()}/support`,
  home: () => `${getSiteBaseUrl()}/`,
};
