/**
 * The same Next site is also reachable on shopgetvaulted.app (an older domain the mobile app and Netlify
 * functions used). Google indexed pages there too and, finding two copies, picked the .app one as canonical,
 * so shopgetvaulted.com pages (including /marketplace) were dropped as "duplicates". Every page request on
 * those hosts now gets a permanent redirect to the same path on shopgetvaulted.com, which tells Google which
 * copy is real. API, Netlify function and build-asset paths are left alone so older app builds that still
 * call the .app host keep working (a redirect would turn their POSTs into GETs).
 */
export const CANONICAL_SITE_ORIGIN = "https://shopgetvaulted.com";

/** Host regex (Next matches it against the whole Host header). */
export const NON_CANONICAL_HOST_PATTERN = "(?:www\\.)?shopgetvaulted\\.app";

/** Paths that must keep answering on the old host instead of redirecting. */
export const NON_REDIRECTED_PATH_PREFIXES = ["api/", "_next/", ".netlify/", "monitoring"] as const;

export function canonicalHostRedirects() {
  const skip = NON_REDIRECTED_PATH_PREFIXES.map((p) => p.replace(/\./g, "\\.")).join("|");
  return [
    {
      source: `/:path((?!${skip}).*)`,
      has: [{ type: "host" as const, value: NON_CANONICAL_HOST_PATTERN }],
      destination: `${CANONICAL_SITE_ORIGIN}/:path`,
      permanent: true,
    },
  ];
}
