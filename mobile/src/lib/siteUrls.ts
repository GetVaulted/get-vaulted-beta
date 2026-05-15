/** Public web URLs (policies, support) — hosted on Netlify `static/`. */

export function getSiteBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_SITE_URL?.trim();
  return (raw?.replace(/\/$/, '') || 'https://beta.shopgetvaulted.com');
}

export const siteUrls = {
  privacy: () => `${getSiteBaseUrl()}/privacy.html`,
  terms: () => `${getSiteBaseUrl()}/terms.html`,
  support: () => `${getSiteBaseUrl()}/support.html`,
  home: () => `${getSiteBaseUrl()}/`,
};
