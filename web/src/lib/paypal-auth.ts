/**
 * Shared PayPal OAuth token + API base for seller payouts and buyer Venmo vault.
 */

export function paypalApiBase(): string {
  const mode = (process.env.PAYPAL_MODE ?? "sandbox").toLowerCase();
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function paypalCredentialsConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim());
}

/** Buyer Venmo vault/charge — requires explicit opt-in + PayPal REST credentials. */
export function isBuyerVenmoPayConfigured(): boolean {
  const flag = (process.env.PAYPAL_BUYER_VENMO_ENABLED ?? "").trim().toLowerCase();
  const enabled = flag === "true" || flag === "1" || flag === "yes";
  return enabled && paypalCredentialsConfigured();
}

/**
 * Buyer PayPal Wallet vault/charge for live.
 * Enabled when PAYPAL_BUYER_ENABLED is on, or when Venmo buyer pay is already configured
 * (same PayPal app credentials / vault permissions).
 */
export function isBuyerPayPalWalletConfigured(): boolean {
  const flag = (process.env.PAYPAL_BUYER_ENABLED ?? "").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  if (flag === "true" || flag === "1" || flag === "yes") {
    return paypalCredentialsConfigured();
  }
  // Default: if Venmo buyer rail is live, PayPal Wallet uses the same PayPal vault stack.
  return isBuyerVenmoPayConfigured();
}

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

export async function getPayPalAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 30_000) {
    return cachedToken.accessToken;
  }
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_NOT_CONFIGURED");
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PAYPAL_AUTH_FAILED:${res.status}:${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("PAYPAL_AUTH_FAILED:missing_token");
  const expiresIn = Math.max(60, Number(json.expires_in ?? 3600));
  cachedToken = {
    accessToken: json.access_token,
    expiresAtMs: now + expiresIn * 1000,
  };
  return json.access_token;
}

/** Test helper — clear cached OAuth token between cases. */
export function clearPayPalAccessTokenCacheForTests(): void {
  cachedToken = null;
}
