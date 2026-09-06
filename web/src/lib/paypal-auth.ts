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

/**
 * Mints a short-lived PayPal user id_token for the JS SDK's `data-user-id-token` script
 * attribute — required to vault a payment method (Venmo/PayPal) to a specific consumer
 * identity in-browser. This is what lets the SDK's Venmo button actually app-switch to the
 * Venmo app instead of falling back to a bare web checkout page.
 * Pass `targetCustomerId` (the PayPal-generated customer id) for a returning payer with an
 * existing saved method; omit it for a first-time payer. Never cached — tied to one session.
 */
export async function getPayPalUserIdToken(targetCustomerId?: string | null): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_NOT_CONFIGURED");
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials", response_type: "id_token" });
  const trimmedTarget = targetCustomerId?.trim();
  if (trimmedTarget) body.set("target_customer_id", trimmedTarget);
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`PAYPAL_ID_TOKEN_FAILED:${res.status}:${bodyText.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("PAYPAL_ID_TOKEN_FAILED:missing_token");
  return json.id_token;
}
