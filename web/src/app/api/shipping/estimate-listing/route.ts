import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isShippoConfigured, shippoCreateShipment } from "@/lib/shippo";

type Body = {
  shipFromAddressId?: unknown;
  parcelWeightOz?: unknown;
  parcelLengthIn?: unknown;
  parcelWidthIn?: unknown;
  parcelHeightIn?: unknown;
};

type CacheRow = { expiresAt: number; payload: unknown };
const CACHE_TTL_MS = 90_000;
const cache = new Map<string, CacheRow>();

function parsePositive(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

const REPRESENTATIVE_DESTINATIONS = [
  { key: "near", zip: "10001", state: "NY" },
  { key: "mid", zip: "60601", state: "IL" },
  { key: "far", zip: "94103", state: "CA" },
] as const;

export async function POST(req: Request) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isShippoConfigured()) {
    return NextResponse.json(
      {
        groups: [],
        destinations: [],
        disclaimer: "Shippo is not configured, so estimates are unavailable.",
      },
      { status: 200 },
    );
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shipFromAddressId = typeof body.shipFromAddressId === "string" ? body.shipFromAddressId.trim() : "";
  if (!shipFromAddressId) {
    return NextResponse.json({ error: "shipFromAddressId is required." }, { status: 400 });
  }
  const pw = parsePositive(body.parcelWeightOz);
  const pl = parsePositive(body.parcelLengthIn);
  const pwi = parsePositive(body.parcelWidthIn);
  const ph = parsePositive(body.parcelHeightIn);
  if (pw == null || pl == null || pwi == null || ph == null) {
    return NextResponse.json({ error: "Complete package details to estimate rates." }, { status: 400 });
  }

  const from = await prisma.address.findFirst({
    where: { id: shipFromAddressId, userId: session.user.id, type: "ship_from" },
  });
  if (!from) return NextResponse.json({ error: "Invalid ship-from address." }, { status: 404 });

  const key = JSON.stringify({ shipFromAddressId, pw, pl, pwi, ph });
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return NextResponse.json(hit.payload);
  }

  const allRows: Array<{
    destinationKey: string;
    carrier: string;
    service: string;
    amountCents: number;
    currency: string;
  }> = [];
  for (const destination of REPRESENTATIVE_DESTINATIONS) {
    const shipment = await shippoCreateShipment({
      address_from: {
        name: from.fullName || from.name,
        street1: from.line1,
        city: from.city,
        state: from.state,
        zip: from.postalCode,
        country: from.country,
      },
      address_to: {
        name: "Shipping estimate",
        street1: "1 Reference Ave",
        city: "Estimate City",
        state: destination.state,
        zip: destination.zip,
        country: "US",
      },
      parcels: [
        {
          length: String(pl),
          width: String(pwi),
          height: String(ph),
          distance_unit: "in",
          weight: String(pw),
          mass_unit: "oz",
        },
      ],
      async: false,
    });
    const rates = Array.isArray((shipment as { rates?: unknown[] }).rates)
      ? ((shipment as { rates?: Record<string, unknown>[] }).rates ?? [])
      : [];
    for (const rate of rates) {
      const carrier = String(rate.provider ?? rate.carrier_account ?? "").trim();
      const service = String(
        (rate.servicelevel as { name?: string } | undefined)?.name ?? rate.servicelevel ?? "",
      ).trim();
      const amount = Number(rate.amount ?? NaN);
      if (!carrier || !service || !Number.isFinite(amount) || amount < 0) continue;
      allRows.push({
        destinationKey: destination.key,
        carrier,
        service,
        amountCents: Math.round(amount * 100),
        currency: String(rate.currency ?? "USD"),
      });
    }
  }

  const grouped = new Map<string, { carrier: string; service: string; minCents: number; maxCents: number; sampleCount: number; currency: string }>();
  for (const row of allRows) {
    const gk = `${row.carrier}__${row.service}__${row.currency}`;
    const existing = grouped.get(gk);
    if (!existing) {
      grouped.set(gk, {
        carrier: row.carrier,
        service: row.service,
        minCents: row.amountCents,
        maxCents: row.amountCents,
        sampleCount: 1,
        currency: row.currency,
      });
      continue;
    }
    existing.minCents = Math.min(existing.minCents, row.amountCents);
    existing.maxCents = Math.max(existing.maxCents, row.amountCents);
    existing.sampleCount += 1;
  }

  const payload = {
    groups: [...grouped.values()].sort((a, b) => a.minCents - b.minCents),
    destinations: REPRESENTATIVE_DESTINATIONS,
    disclaimer:
      "Estimated rates use representative US destinations and can differ from checkout label prices.",
  };
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  return NextResponse.json(payload);
}
