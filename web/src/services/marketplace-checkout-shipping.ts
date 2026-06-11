import { hasCompleteParcel } from "@/lib/listing-publish";
import {
  marketplaceOfferableRates,
  type MarketplaceCheckoutRateQuote,
} from "@/lib/marketplace-shipping-offer";
import { prisma } from "@/lib/prisma";
import { isShippoConfigured, shippoCreateShipment, shippoListRates, type ShippoAddress, type ShippoParcel } from "@/lib/shippo";

export type CheckoutShipTo = {
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
};

export type ResolvedCheckoutShipping = {
  shippingPriceUsd: number;
  carrier: string | null;
  service: string | null;
  shippoRateId: string | null;
};

type ShippoRateRow = {
  object_id?: string;
  amount?: string;
  currency?: string;
  provider?: string;
  servicelevel?: { name?: string };
  duration_terms?: string;
  estimated_days?: number | null;
  attributes?: string[];
};

const DEFAULT_PARCEL: ShippoParcel = {
  length: "10",
  width: "8",
  height: "4",
  distance_unit: "in",
  weight: "16",
  mass_unit: "oz",
};

function parcelFromListing(w?: number | null, l?: number | null, wi?: number | null, h?: number | null): ShippoParcel {
  if (w != null && l != null && wi != null && h != null && [w, l, wi, h].every((n) => Number.isFinite(n) && n > 0)) {
    return {
      length: String(l),
      width: String(wi),
      height: String(h),
      distance_unit: "in",
      weight: String(Math.max(1, w)),
      mass_unit: "oz",
    };
  }
  return DEFAULT_PARCEL;
}

function rateHasAttribute(rate: ShippoRateRow, token: string): boolean {
  return (rate.attributes ?? []).some((a) => a.toUpperCase() === token.toUpperCase());
}

function deliveryLabelAndDays(rate: ShippoRateRow): { label: string; estimatedDays: number | null } {
  if (rate.duration_terms?.trim()) {
    const d = rate.estimated_days != null && rate.estimated_days > 0 ? rate.estimated_days : null;
    return { label: rate.duration_terms.trim(), estimatedDays: d };
  }
  const days = rate.estimated_days;
  if (days != null && days > 0) {
    if (days === 1) return { label: "Estimated 1 business day", estimatedDays: days };
    return { label: `Estimated ${days} business days`, estimatedDays: days };
  }
  return { label: "Delivery time varies by carrier", estimatedDays: null };
}

function mapShippoRateToQuote(rate: ShippoRateRow): MarketplaceCheckoutRateQuote | null {
  if (!rate.object_id) return null;
  const trackingIncluded =
    rateHasAttribute(rate, "TRACKING") ||
    rateHasAttribute(rate, "TRACKING_INCLUDED") ||
    !rateHasAttribute(rate, "NO_TRACKING");
  const insuranceAvailable = rateHasAttribute(rate, "INSURANCE") || rateHasAttribute(rate, "INSURANCE_INCLUDED");
  const { label, estimatedDays } = deliveryLabelAndDays(rate);
  return {
    id: rate.object_id,
    carrier: rate.provider?.trim() || "Carrier",
    serviceLevel: rate.servicelevel?.name?.trim() || "Standard",
    estimatedDelivery: label,
    estimatedDays,
    amount: rate.amount ?? "0",
    currency: (rate.currency ?? "USD").toUpperCase(),
    trackingIncluded,
    insuranceAvailable,
  };
}

function compareQuotes(a: MarketplaceCheckoutRateQuote, b: MarketplaceCheckoutRateQuote): number {
  const pa = Number(a.amount);
  const pb = Number(b.amount);
  if (pa !== pb) return pa - pb;
  const da = a.estimatedDays ?? 999;
  const db = b.estimatedDays ?? 999;
  if (da !== db) return da - db;
  return `${a.carrier} ${a.serviceLevel}`.localeCompare(`${b.carrier} ${b.serviceLevel}`);
}

function mockCheckoutRateQuotes(): MarketplaceCheckoutRateQuote[] {
  return [
    {
      id: "mock-usps-ground",
      carrier: "USPS",
      serviceLevel: "Ground Advantage",
      estimatedDelivery: "Estimated 3–5 business days",
      estimatedDays: 5,
      amount: "8.42",
      currency: "USD",
      trackingIncluded: true,
      insuranceAvailable: true,
    },
    {
      id: "mock-ups-ground",
      carrier: "UPS",
      serviceLevel: "Ground",
      estimatedDelivery: "Estimated 2–4 business days",
      estimatedDays: 3,
      amount: "11.18",
      currency: "USD",
      trackingIncluded: true,
      insuranceAvailable: true,
    },
    {
      id: "mock-fedex-home",
      carrier: "FedEx",
      serviceLevel: "Home Delivery",
      estimatedDelivery: "Estimated 2–5 business days",
      estimatedDays: 4,
      amount: "12.65",
      currency: "USD",
      trackingIncluded: true,
      insuranceAvailable: true,
    },
  ].sort(compareQuotes);
}

async function loadListingShippingContext(listingId: string) {
  return prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      shippingPriceUsd: true,
      parcelWeightOz: true,
      parcelLengthIn: true,
      parcelWidthIn: true,
      parcelHeightIn: true,
      marketplaceShippingOfferScope: true,
      marketplaceAllowedRateKeys: true,
      shipFromAddress: {
        select: {
          fullName: true,
          line1: true,
          line2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      },
      seller: {
        select: {
          shipFromName: true,
          shipFromStreet: true,
          shipFromCity: true,
          shipFromState: true,
          shipFromZip: true,
          shipFromCountry: true,
        },
      },
    },
  });
}

function resolveShipFromAddress(
  listing: NonNullable<Awaited<ReturnType<typeof loadListingShippingContext>>>,
): ShippoAddress | null {
  const addr = listing.shipFromAddress;
  if (addr?.line1 && addr.city && addr.state && addr.postalCode && addr.country) {
    return {
      name: addr.fullName || "Seller",
      street1: [addr.line1, addr.line2].filter(Boolean).join(" "),
      city: addr.city,
      state: addr.state,
      zip: addr.postalCode,
      country: addr.country,
    };
  }
  const from = listing.seller;
  if (!from.shipFromStreet || !from.shipFromCity || !from.shipFromState || !from.shipFromZip || !from.shipFromCountry) {
    return null;
  }
  return {
    name: from.shipFromName || "Seller",
    street1: from.shipFromStreet,
    city: from.shipFromCity,
    state: from.shipFromState,
    zip: from.shipFromZip,
    country: from.shipFromCountry,
  };
}

function shipToAddress(shipTo: CheckoutShipTo): ShippoAddress {
  return {
    name: shipTo.shipRecipientName || "Buyer",
    street1: shipTo.shipAddress,
    city: shipTo.shipCity,
    state: shipTo.shipState,
    zip: shipTo.shipZip,
    country: shipTo.shipCountry || "US",
  };
}

async function fetchRawShippoQuotes(
  listing: NonNullable<Awaited<ReturnType<typeof loadListingShippingContext>>>,
  shipTo: CheckoutShipTo,
): Promise<{ rates: MarketplaceCheckoutRateQuote[]; mock: boolean }> {
  const parcel = parcelFromListing(
    listing.parcelWeightOz,
    listing.parcelLengthIn,
    listing.parcelWidthIn,
    listing.parcelHeightIn,
  );
  const addressFrom = resolveShipFromAddress(listing);
  if (!addressFrom) {
    throw new Error("SELLER_SHIP_FROM_INCOMPLETE");
  }

  if (!isShippoConfigured()) {
    return { rates: mockCheckoutRateQuotes(), mock: true };
  }

  const shipment = (await shippoCreateShipment({
    address_from: addressFrom,
    address_to: shipToAddress(shipTo),
    parcels: [parcel],
    async: false,
  })) as { object_id?: string };

  const sid = shipment.object_id;
  if (!sid) throw new Error("SHIPPO_SHIPMENT_FAILED");

  const ratesRes = (await shippoListRates(sid)) as { results?: ShippoRateRow[] };
  const quotes = (ratesRes.results ?? [])
    .map(mapShippoRateToQuote)
    .filter((q): q is MarketplaceCheckoutRateQuote => q != null)
    .sort(compareQuotes);

  return { rates: quotes, mock: false };
}

export async function fetchMarketplaceCheckoutShippingRates(args: {
  listingId: string;
  shipTo: CheckoutShipTo;
}): Promise<{ rates: MarketplaceCheckoutRateQuote[]; mock: boolean }> {
  const listing = await loadListingShippingContext(args.listingId);
  if (!listing) throw new Error("LISTING_NOT_FOUND");

  if (listing.shippingPriceUsd > 0) {
    return { rates: [], mock: false };
  }

  const { rates: raw, mock } = await fetchRawShippoQuotes(listing, args.shipTo);
  let offerable = marketplaceOfferableRates(
    raw,
    listing.marketplaceShippingOfferScope,
    listing.marketplaceAllowedRateKeys,
  );
  if (offerable.length === 0 && raw.length > 0) {
    console.warn("[checkout-shipping] seller offer filter returned no rates; using live Shippo quotes", {
      listingId: args.listingId,
      scope: listing.marketplaceShippingOfferScope,
      rawCount: raw.length,
      parcelComplete: hasCompleteParcel(listing),
    });
    offerable = raw;
  }
  return { rates: offerable, mock };
}

export async function resolveMarketplaceCheckoutShipping(args: {
  listingId: string;
  shipTo: CheckoutShipTo;
  selectedShippingRateId?: string | null;
}): Promise<ResolvedCheckoutShipping> {
  const listing = await loadListingShippingContext(args.listingId);
  if (!listing) throw new Error("LISTING_NOT_FOUND");

  if (listing.shippingPriceUsd > 0) {
    return {
      shippingPriceUsd: listing.shippingPriceUsd,
      carrier: null,
      service: null,
      shippoRateId: null,
    };
  }

  const rateId = args.selectedShippingRateId?.trim();
  if (!rateId) throw new Error("SHIPPING_RATE_REQUIRED");

  const { rates } = await fetchMarketplaceCheckoutShippingRates({
    listingId: args.listingId,
    shipTo: args.shipTo,
  });
  const picked = rates.find((r) => r.id === rateId);
  if (!picked) throw new Error("SHIPPING_RATE_INVALID");

  const amount = Number(picked.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("SHIPPING_RATE_INVALID");

  return {
    shippingPriceUsd: Math.round(amount * 100) / 100,
    carrier: picked.carrier,
    service: picked.serviceLevel,
    shippoRateId: picked.id,
  };
}
