import type { Handler } from '@netlify/functions';
import { requireShippoToken } from './_lib/env';
import {
  fetchListingRatesFromShippo,
  mockListingRateQuotes,
  type ListingRateQuoteRequest,
} from './_lib/shippo-listing-rates';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

function parseBody(raw: string | null): ListingRateQuoteRequest | { error: string } {
  try {
    const b = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    const ship_from_zip = String(b.ship_from_zip ?? '').trim();
    const weight_lb = Number(b.weight_lb);
    const length_in = Number(b.length_in);
    const width_in = Number(b.width_in);
    const height_in = Number(b.height_in);
    const shipTo = String(b.ship_to_zip ?? '').trim();
    const shipToDigits = shipTo.replace(/\D/g, '').slice(0, 5);
    const international = Boolean(b.international);
    if (!ship_from_zip) return { error: 'ship_from_zip is required' };
    if (!Number.isFinite(weight_lb) || !Number.isFinite(length_in) || !Number.isFinite(width_in) || !Number.isFinite(height_in)) {
      return { error: 'Invalid package dimensions' };
    }
    return {
      ship_from_zip,
      ship_to_zip: shipToDigits.length === 5 ? shipToDigits : undefined,
      weight_lb,
      length_in,
      width_in,
      height_in,
      international,
    };
    return { error: 'Invalid JSON' };
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const parsed = parseBody(event.body);
  if ('error' in parsed) {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: parsed.error }),
    };
  }

  const tokenResult = requireShippoToken();
  if (typeof tokenResult === 'object') {
    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rates: mockListingRateQuotes(),
        mock: true,
        notice: tokenResult.error,
      }),
    };
  }

  try {
    const { rates, mock } = await fetchListingRatesFromShippo(tokenResult, parsed);
    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates, mock: mock ?? false }),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Shippo rate lookup failed';
    return {
      statusCode: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message, rates: [] }),
    };
  }
};
