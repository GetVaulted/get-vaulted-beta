import { getNetlifyFunctionsBase } from '../lib/netlifyFunctions';
import type { ListingShippoRate } from '../createListing/shippoRates';

export type FetchListingRatesParams = {
  shipFromZip: string;
  shipToZip?: string;
  weightLb: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  international: boolean;
};

export type FetchListingRatesResult = {
  rates: ListingShippoRate[];
  mock?: boolean;
  error?: string;
};

export async function fetchListingShippoRates(params: FetchListingRatesParams): Promise<FetchListingRatesResult> {
  const base = getNetlifyFunctionsBase();
  if (!base) {
    return { rates: [], error: 'Shipping rates are not configured (missing EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE).' };
  }

  const res = await fetch(`${base}/shippo-listing-rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      ship_from_zip: params.shipFromZip.replace(/\D/g, '').slice(0, 5),
      ship_to_zip:
        params.shipToZip?.replace(/\D/g, '').length === 5
          ? params.shipToZip.replace(/\D/g, '').slice(0, 5)
          : undefined,
      weight_lb: params.weightLb,
      length_in: params.lengthIn,
      width_in: params.widthIn,
      height_in: params.heightIn,
      international: params.international,
    }),
  });

  const text = await res.text();
  let data: { rates?: ListingShippoRate[]; mock?: boolean; error?: string };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return { rates: [], error: 'Invalid response from shipping rates service.' };
  }

  if (!res.ok) {
    return { rates: data.rates ?? [], error: data.error ?? `Rates request failed (${res.status})` };
  }

  return { rates: data.rates ?? [], mock: data.mock };
}
