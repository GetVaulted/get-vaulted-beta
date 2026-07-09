import type { ShippoLabelFileType } from "@/lib/shippo-label-format";

import { createHmac, timingSafeEqual } from "node:crypto";

const SHIPPO_BASE = "https://api.goshippo.com";

/** Request timeout for Shippo API calls. A hung Shippo connection must not hang checkout indefinitely. */
function shippoTimeoutMs(): number {
  const raw = Number(process.env.SHIPPO_TIMEOUT_MS);
  return raw > 0 ? raw : 12_000;
}

export function isShippoConfigured(): boolean {
  return Boolean(process.env.SHIPPO_API_TOKEN && process.env.SHIPPO_API_TOKEN.length > 5);
}

export function shippoTokenKind(): "test" | "live" | "missing" | "unknown" {
  const t = process.env.SHIPPO_API_TOKEN?.trim() ?? "";
  if (!t) return "missing";
  if (t.startsWith("shippo_test_")) return "test";
  if (t.startsWith("shippo_live_")) return "live";
  return "unknown";
}

/** Lightweight API ping — verifies the runtime token is accepted by Shippo (not just present in env). */
export async function probeShippoApi(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isShippoConfigured()) {
    return { ok: false, error: "SHIPPO_API_TOKEN is not set in this server runtime." };
  }
  try {
    await shippoFetch("/addresses/?results=1");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

function token(): string {
  const t = process.env.SHIPPO_API_TOKEN;
  if (!t) throw new Error("SHIPPO_API_TOKEN is not set");
  return t;
}

async function shippoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const timeoutMs = shippoTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${SHIPPO_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `ShippoToken ${token()}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Shippo request timed out after ${timeoutMs}ms: ${path}`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Shippo non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" && json !== null && "detail" in json
        ? String((json as { detail?: string }).detail)
        : text.slice(0, 200);
    throw new Error(`Shippo ${res.status}: ${msg}`);
  }
  return json as T;
}

export type ShippoAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  email?: string;
  phone?: string;
};

export type ShippoValidatedAddressResponse = ShippoAddress & {
  object_state?: string;
  validation_results?: {
    is_valid?: boolean;
    messages?: Array<{ text?: string; code?: string; type?: string; source?: string }>;
  };
};

export async function shippoValidateAddress(body: ShippoAddress): Promise<ShippoValidatedAddressResponse> {
  return shippoFetch("/addresses/", {
    method: "POST",
    body: JSON.stringify({ ...body, validate: true }),
  });
}

export async function shippoAutocompleteFind(args: {
  address: string;
  countryCode: string;
  container?: string;
  limit?: number;
}): Promise<unknown> {
  const params = new URLSearchParams({
    address: args.address,
    country_code: args.countryCode,
    offset: "0",
    limit: String(args.limit ?? 8),
  });
  if (args.container?.trim()) params.set("container", args.container.trim());
  return shippoFetch(`/v2/addresses/autocomplete/find?${params.toString()}`);
}

export async function shippoAutocompleteRetrieve(id: string): Promise<unknown> {
  const params = new URLSearchParams({ id: id.trim() });
  return shippoFetch(`/v2/addresses/autocomplete/retrieve?${params.toString()}`);
}

export type ShippoParcel = {
  length: string;
  width: string;
  height: string;
  distance_unit: "in" | "cm";
  weight: string;
  mass_unit: "oz" | "lb" | "g" | "kg";
};

export async function shippoCreateShipment(body: Record<string, unknown>): Promise<{ object_id?: string } & Record<string, unknown>> {
  return shippoFetch("/shipments/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function shippoListRates(shipmentObjectId: string): Promise<{ results?: unknown[] } & Record<string, unknown>> {
  return shippoFetch(`/shipments/${encodeURIComponent(shipmentObjectId)}/rates/`);
}

export async function shippoPurchaseRate(
  rateObjectId: string,
  labelFileType: ShippoLabelFileType = "PDF",
): Promise<Record<string, unknown>> {
  return shippoFetch("/transactions/", {
    method: "POST",
    body: JSON.stringify({ rate: rateObjectId, label_file_type: labelFileType, async: false }),
  });
}

export type ShippoTransaction = {
  object_id?: string;
  status?: string;
  tracking_number?: string;
  tracking_url_provider?: string;
  label_url?: string;
  messages?: { text?: string }[];
};

export async function shippoGetTransaction(transactionObjectId: string): Promise<ShippoTransaction> {
  return shippoFetch(`/transactions/${encodeURIComponent(transactionObjectId)}/`);
}

export function verifyShippoWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.SHIPPO_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  // TODO: Align with Shippo’s documented webhook signature header and encoding for your account version.
  try {
    const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
    const a = Buffer.from(digest);
    const b = Buffer.from(signatureHeader);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Shippo self-generated URL token (?token=...) echoed on webhook POST — see docs/Tracking/WebhookSecurity. */
export function verifyShippoWebhookUrlToken(requestUrl: string): boolean {
  const secret = process.env.SHIPPO_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  try {
    const token = new URL(requestUrl).searchParams.get("token")?.trim();
    if (!token) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Accept HMAC signature header or Shippo URL token query param. */
export function verifyShippoWebhookRequest(args: {
  rawBody: string;
  signatureHeader: string | null;
  requestUrl: string;
}): boolean {
  const secret = process.env.SHIPPO_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  if (args.signatureHeader && verifyShippoWebhookSignature(args.rawBody, args.signatureHeader)) return true;
  return verifyShippoWebhookUrlToken(args.requestUrl);
}
