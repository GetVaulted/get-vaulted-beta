function trimBase(u: string): string {
  return u.trim().replace(/\/$/, "");
}

function normalizeHttpsBase(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return trimBase(t.startsWith("http") ? t : `https://${t}`);
}

function isLocalOrPrivateBase(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".local")) return true;
    if (u.protocol === "http:" && /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    return false;
  } catch {
    return true;
  }
}

function baseFromRequest(request: Request): string | null {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.trim();
  if (!host || isLocalOrPrivateBase(`https://${host}`)) return null;
  const proto = (request.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
  return `${proto}://${host}`;
}

/**
 * Public app origin for Stripe Connect Account Link return/refresh URLs (mobile + web).
 * Prefer STRIPE_CONNECT_PUBLIC_APP_URL, then NEXT_PUBLIC_SITE_URL, then request host on beta.
 */
export function stripeConnectPublicAppBase(request?: Request): string {
  const explicit = process.env.STRIPE_CONNECT_PUBLIC_APP_URL?.trim();
  if (explicit) return normalizeHttpsBase(explicit);

  const nextPublic = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (nextPublic && !isLocalOrPrivateBase(normalizeHttpsBase(nextPublic))) {
    return normalizeHttpsBase(nextPublic);
  }

  const authUrl = process.env.NEXTAUTH_URL?.trim();
  if (authUrl && !isLocalOrPrivateBase(normalizeHttpsBase(authUrl))) {
    return normalizeHttpsBase(authUrl);
  }

  if (request) {
    const fromReq = baseFromRequest(request);
    if (fromReq) return fromReq;
  }

  return normalizeHttpsBase(nextPublic || authUrl || "http://localhost:3000");
}

export function stripeConnectMobileReturnUrls(request: Request): { returnUrl: string; refreshUrl: string } {
  const base = stripeConnectPublicAppBase(request);
  return {
    returnUrl: `${base}/mobile/stripe-connect-return`,
    refreshUrl: `${base}/mobile/stripe-connect-return?refresh=1`,
  };
}
