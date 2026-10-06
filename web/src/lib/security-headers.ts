/**
 * Security headers applied to every response via `next.config.ts`. Kept deliberately
 * conservative on the script/style/connect fronts (this app has no CSP nonce infrastructure yet
 * and depends on Stripe.js, Supabase, Sentry, and AWS IVS from a range of dynamic third-party
 * hosts), but the clickjacking, MIME-sniffing, transport, and referrer protections below are
 * unconditionally enforced since they carry effectively zero risk of breaking existing
 * functionality.
 *
 * Content-Security-Policy ships in Report-Only mode first: it reports violations (visible in
 * browser devtools / a future report-uri) without blocking anything, so it can be tightened and
 * promoted to a fully-enforced `Content-Security-Policy` header once real traffic confirms it
 * doesn't clip a legitimate resource (Stripe Elements iframes, Supabase Storage images, IVS
 * playback, Sentry ingest, etc.).
 */
export function buildContentSecurityPolicyReportOnly(): string {
  const connectHosts = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://api.stripe.com",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
  ];
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    `connect-src ${connectHosts.join(" ")}`,
  ].join("; ");
}

export function buildSecurityHeaders(): { key: string; value: string }[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // camera/microphone must allow 'self': the seller live-console pages call getUserMedia
    // from this origin to broadcast. A blanket camera=() microphone=() (deny for every origin,
    // including this site's own pages) overrides the browser's per-site permission entirely -
    // Chrome shows the site as allowed, but this header blocks the request before that grant is
    // ever consulted, throwing a NotAllowedError with no permission prompt at all. 'self' still
    // blocks camera/mic for any third-party iframe embedding this site, which was the original
    // intent here.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()" },
    { key: "Content-Security-Policy-Report-Only", value: buildContentSecurityPolicyReportOnly() },
  ];
}
