/**
 * Low-level Trustap REST helpers.
 * @see https://docs.trustap.com/apis/openapi
 */

function normalizeApiV1Base(raw: string): string {
  const t = raw.trim().replace(/\/$/, "");
  if (t.endsWith("/api/v1")) return t;
  if (t.endsWith("/api")) return `${t}/v1`;
  return `${t}/api/v1`;
}

export function trustapApiV1BaseUrl(): string {
  const raw = process.env.TRUSTAP_API_BASE_URL?.trim();
  if (!raw) throw new Error("TRUSTAP_API_BASE_URL is not set");
  return normalizeApiV1Base(raw);
}

export function trustapActionsBaseUrl(): string {
  const explicit = process.env.TRUSTAP_ACTIONS_BASE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const api = process.env.TRUSTAP_API_BASE_URL?.toLowerCase() ?? "";
  if (api.includes("stage") || api.includes("dev.stage")) return "https://actions.stage.trustap.com";
  return "https://actions.trustap.com";
}

export function trustapBasicAuthHeader(apiKey: string): string {
  const token = Buffer.from(`${apiKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

export async function trustapGetCharge(args: {
  apiKey: string;
  priceMinorUnits: number;
  currency: string;
}): Promise<{ charge: number; charge_calculator_version: number; charge_seller: number }> {
  const base = trustapApiV1BaseUrl();
  const q = new URLSearchParams({
    price: String(args.priceMinorUnits),
    currency: args.currency.toLowerCase(),
  });
  const res = await fetch(`${base}/charge?${q.toString()}`, {
    headers: { Authorization: trustapBasicAuthHeader(args.apiKey) },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { rawBody: text };
  }
  if (!res.ok) {
    throw new Error(`Trustap GET /charge failed: HTTP ${res.status} ${text.slice(0, 400)}`);
  }
  const o = json as Record<string, unknown>;
  const charge = Number(o.charge);
  const charge_calculator_version = Number(o.charge_calculator_version);
  const charge_seller = Number(o.charge_seller ?? 0);
  if (!Number.isFinite(charge) || !Number.isFinite(charge_calculator_version)) {
    throw new Error("Trustap /charge response missing charge or charge_calculator_version");
  }
  return { charge, charge_calculator_version, charge_seller };
}

export async function trustapCreateGuestUser(args: {
  apiKey: string;
  email: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  tosIp: string;
  tosUnix: number;
}): Promise<{ id: string }> {
  const base = trustapApiV1BaseUrl();
  const res = await fetch(`${base}/guest_users`, {
    method: "POST",
    headers: {
      Authorization: trustapBasicAuthHeader(args.apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: args.email,
      first_name: args.firstName,
      last_name: args.lastName,
      country_code: args.countryCode,
      tos_acceptance: { ip: args.tosIp, unix_timestamp: args.tosUnix },
    }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { rawBody: text };
  }
  if (!res.ok) {
    throw new Error(`Trustap POST /guest_users failed: HTTP ${res.status} ${text.slice(0, 400)}`);
  }
  const id = String((json as Record<string, unknown>).id ?? "");
  if (!id) throw new Error("Trustap guest_users response missing id");
  return { id };
}

export async function trustapCreateOnlineTransactionWithGuestUser(args: {
  apiKey: string;
  trustapUserHeader: string;
  body: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const base = trustapApiV1BaseUrl();
  const res = await fetch(`${base}/me/transactions/create_with_guest_user`, {
    method: "POST",
    headers: {
      Authorization: trustapBasicAuthHeader(args.apiKey),
      "Trustap-User": args.trustapUserHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { rawBody: text };
  }
  if (!res.ok) {
    throw new Error(`Trustap create_with_guest_user failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  return json as Record<string, unknown>;
}

export async function trustapGetTransaction(args: { apiKey: string; transactionId: string }): Promise<Record<string, unknown>> {
  const base = trustapApiV1BaseUrl();
  const res = await fetch(`${base}/transactions/${encodeURIComponent(args.transactionId)}`, {
    headers: { Authorization: trustapBasicAuthHeader(args.apiKey) },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { rawBody: text };
  }
  if (!res.ok) {
    throw new Error(`Trustap GET /transactions/{id} failed: HTTP ${res.status} ${text.slice(0, 400)}`);
  }
  return json as Record<string, unknown>;
}

export async function trustapConfirmDeliveryGuestBuyer(args: {
  apiKey: string;
  trustapBuyerUserHeader: string;
  transactionId: string;
}): Promise<Record<string, unknown>> {
  const base = trustapApiV1BaseUrl();
  const res = await fetch(`${base}/transactions/${encodeURIComponent(args.transactionId)}/confirm_delivery_with_guest_buyer`, {
    method: "POST",
    headers: {
      Authorization: trustapBasicAuthHeader(args.apiKey),
      "Trustap-User": args.trustapBuyerUserHeader,
    },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { rawBody: text };
  }
  if (!res.ok) {
    throw new Error(`Trustap confirm_delivery_with_guest_buyer failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  return json as Record<string, unknown>;
}

export async function trustapCancelWithGuestUser(args: {
  apiKey: string;
  trustapUserHeader: string;
  transactionId: string;
}): Promise<Record<string, unknown>> {
  const base = trustapApiV1BaseUrl();
  const res = await fetch(`${base}/transactions/${encodeURIComponent(args.transactionId)}/cancel_with_guest_user`, {
    method: "POST",
    headers: {
      Authorization: trustapBasicAuthHeader(args.apiKey),
      "Trustap-User": args.trustapUserHeader,
    },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { rawBody: text };
  }
  if (!res.ok) {
    throw new Error(`Trustap cancel_with_guest_user failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  return json as Record<string, unknown>;
}

export function trustapGuestPayUrl(transactionId: string, redirectUri: string): string {
  const actions = trustapActionsBaseUrl();
  const q = new URLSearchParams({ redirect_uri: redirectUri });
  return `${actions}/online/transactions/${encodeURIComponent(transactionId)}/guest_pay?${q.toString()}`;
}
