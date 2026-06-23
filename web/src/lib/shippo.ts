/**
 * Shippo REST client (https://docs.goshippo.com/).
 * TODO: Add retries, rate limits, and structured error types for production.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const SHIPPO_BASE = "https://api.goshippo.com";

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
  const res = await fetch(`${SHIPPO_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `ShippoToken ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
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
  city: string;
  state: string;
  zip: string;
  country: string;
};

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

export async function shippoPurchaseRate(rateObjectId: string): Promise<Record<string, unknown>> {
  return shippoFetch("/transactions/", {
    method: "POST",
    body: JSON.stringify({ rate: rateObjectId, label_file_type: "PDF", async: false }),
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
