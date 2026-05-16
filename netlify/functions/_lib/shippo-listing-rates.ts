import {
  shippoCreateAddress,
  shippoCreateShipment,
  type ShippoParcelInput,
  type ShippoShipmentRate,
} from './shippo';

export type ListingRateQuoteRequest = {
  ship_from_zip: string;
  /** Optional US buyer ZIP — when set (domestic), quotes use real lane/zone instead of a fixed benchmark. */
  ship_to_zip?: string;
  weight_lb: number;
  length_in: number;
  width_in: number;
  height_in: number;
  international?: boolean;
};

export type ListingRateQuote = {
  id: string;
  carrier: string;
  serviceLevel: string;
  estimatedDelivery: string;
  /** Shippo's business-day estimate when present; used for secondary sort. */
  estimatedDays: number | null;
  amount: string;
  currency: string;
  trackingIncluded: boolean;
  insuranceAvailable: boolean;
};

const US_BENCHMARK_ZIP = '10001';

const INTL_BENCHMARK = {
  name: 'Buyer estimate',
  street1: '100 Queen St W',
  city: 'Toronto',
  state: 'ON',
  zip: 'M5H 2N2',
  country: 'CA',
};

async function zipToUsPlace(zip: string): Promise<{ city: string; state: string } | null> {
  const z = zip.replace(/\D/g, '').slice(0, 5);
  if (z.length !== 5) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${z}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      places?: { 'place name': string; 'state abbreviation': string }[];
    };
    const place = data.places?.[0];
    if (!place) return null;
    return { city: place['place name'], state: place['state abbreviation'] };
  } catch {
    return null;
  }
}

function deliveryLabelAndDays(rate: ShippoShipmentRate): { label: string; estimatedDays: number | null } {
  if (rate.duration_terms?.trim()) {
    const d = rate.estimated_days != null && rate.estimated_days > 0 ? rate.estimated_days : null;
    return { label: rate.duration_terms.trim(), estimatedDays: d };
  }
  const days = rate.estimated_days;
  if (days != null && days > 0) {
    if (days === 1) return { label: 'Estimated 1 business day', estimatedDays: days };
    return { label: `Estimated ${days} business days`, estimatedDays: days };
  }
  return { label: 'Delivery time varies by carrier', estimatedDays: null };
}

/** Lowest price first; ties broken by fewer transit days (closer / faster lane), then carrier name. */
function compareShippoRates(a: ShippoShipmentRate, b: ShippoShipmentRate): number {
  const pa = Number(a.amount);
  const pb = Number(b.amount);
  if (pa !== pb) return pa - pb;
  const da = a.estimated_days != null && a.estimated_days > 0 ? a.estimated_days : 999;
  const db = b.estimated_days != null && b.estimated_days > 0 ? b.estimated_days : 999;
  if (da !== db) return da - db;
  const na = `${a.provider ?? ''} ${a.servicelevel?.name ?? ''}`.trim();
  const nb = `${b.provider ?? ''} ${b.servicelevel?.name ?? ''}`.trim();
  return na.localeCompare(nb);
}

function rateHasAttribute(rate: ShippoShipmentRate, token: string): boolean {
  return (rate.attributes ?? []).some((a) => a.toUpperCase() === token.toUpperCase());
}

export function mapShippoRateToQuote(rate: ShippoShipmentRate): ListingRateQuote {
  const trackingIncluded =
    rateHasAttribute(rate, 'TRACKING') ||
    rateHasAttribute(rate, 'TRACKING_INCLUDED') ||
    !rateHasAttribute(rate, 'NO_TRACKING');
  const insuranceAvailable = rateHasAttribute(rate, 'INSURANCE') || rateHasAttribute(rate, 'INSURANCE_INCLUDED');
  const { label, estimatedDays } = deliveryLabelAndDays(rate);

  return {
    id: rate.object_id,
    carrier: rate.provider?.trim() || 'Carrier',
    serviceLevel: rate.servicelevel?.name?.trim() || 'Standard',
    estimatedDelivery: label,
    estimatedDays,
    amount: rate.amount,
    currency: (rate.currency ?? 'USD').toUpperCase(),
    trackingIncluded,
    insuranceAvailable,
  };
}

function sortQuotesByPriceThenTransit(quotes: ListingRateQuote[]): ListingRateQuote[] {
  return [...quotes].sort((a, b) => {
    const pa = Number(a.amount);
    const pb = Number(b.amount);
    if (pa !== pb) return pa - pb;
    const da = a.estimatedDays ?? 999;
    const db = b.estimatedDays ?? 999;
    if (da !== db) return da - db;
    return `${a.carrier} ${a.serviceLevel}`.localeCompare(`${b.carrier} ${b.serviceLevel}`);
  });
}

export function mockListingRateQuotes(): ListingRateQuote[] {
  return sortQuotesByPriceThenTransit([
    {
      id: 'mock-fedex-home',
      carrier: 'FedEx',
      serviceLevel: 'Home Delivery',
      estimatedDelivery: 'Estimated 2–5 business days',
      estimatedDays: 4,
      amount: '12.65',
      currency: 'USD',
      trackingIncluded: true,
      insuranceAvailable: true,
    },
    {
      id: 'mock-ups-ground',
      carrier: 'UPS',
      serviceLevel: 'Ground',
      estimatedDelivery: 'Estimated 2–4 business days',
      estimatedDays: 3,
      amount: '11.18',
      currency: 'USD',
      trackingIncluded: true,
      insuranceAvailable: true,
    },
    {
      id: 'mock-usps-ground',
      carrier: 'USPS',
      serviceLevel: 'Ground Advantage',
      estimatedDelivery: 'Estimated 3–5 business days',
      estimatedDays: 5,
      amount: '8.42',
      currency: 'USD',
      trackingIncluded: true,
      insuranceAvailable: true,
    },
  ]);
}

async function resolveDomesticShipTo(req: ListingRateQuoteRequest): Promise<{
  name: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  country: 'US';
}> {
  const raw = req.ship_to_zip?.replace(/\D/g, '').slice(0, 5) ?? '';
  if (raw.length === 5) {
    const place = await zipToUsPlace(raw);
    if (place) {
      return {
        name: 'Domestic buyer estimate',
        street1: '100 Main St',
        city: place.city,
        state: place.state,
        zip: raw,
        country: 'US',
      };
    }
  }
  return {
    name: 'Domestic buyer estimate',
    street1: '350 5th Ave',
    city: 'New York',
    state: 'NY',
    zip: US_BENCHMARK_ZIP,
    country: 'US',
  };
}

export async function fetchListingRatesFromShippo(
  token: string,
  req: ListingRateQuoteRequest,
): Promise<{ rates: ListingRateQuote[]; mock?: boolean }> {
  const zip = req.ship_from_zip.replace(/\D/g, '').slice(0, 5);
  if (zip.length !== 5) {
    throw new Error('Enter a valid 5-digit US ship-from ZIP code.');
  }
  if (req.weight_lb <= 0 || req.length_in <= 0 || req.width_in <= 0 || req.height_in <= 0) {
    throw new Error('Package weight and dimensions must be greater than zero.');
  }

  const fromPlace = await zipToUsPlace(zip);
  if (!fromPlace) {
    throw new Error('Could not resolve ship-from ZIP — check the code and try again.');
  }

  const fromAddress = {
    name: 'Seller ship-from',
    street1: '1 Shipping Ln',
    city: fromPlace.city,
    state: fromPlace.state,
    zip,
    country: 'US',
  };

  const toAddress = req.international ? INTL_BENCHMARK : await resolveDomesticShipTo(req);

  const parcel: ShippoParcelInput = {
    length: String(req.length_in),
    width: String(req.width_in),
    height: String(req.height_in),
    distance_unit: 'in',
    weight: String(req.weight_lb),
    mass_unit: 'lb',
  };

  const [from, to] = await Promise.all([
    shippoCreateAddress(token, fromAddress),
    shippoCreateAddress(token, toAddress),
  ]);

  const shipment = await shippoCreateShipment(token, {
    address_from: from.object_id,
    address_to: to.object_id,
    parcels: [parcel],
    async: false,
  });

  const raw = shipment.rates ?? [];
  if (raw.length === 0) {
    return { rates: [], mock: false };
  }

  const sorted = [...raw].sort(compareShippoRates);
  const quotes = sorted.map(mapShippoRateToQuote);

  return { rates: quotes, mock: false };
}
