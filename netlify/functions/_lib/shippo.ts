/** Shippo REST helpers (token auth). Production: add carrier accounts + rate selection. */

const SHIPPO_BASE = 'https://api.goshippo.com';

export type ShippoAddressInput = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
};

export type ShippoParcelInput = {
  length: string;
  width: string;
  height: string;
  distance_unit: 'in' | 'cm';
  weight: string;
  mass_unit: 'lb' | 'kg' | 'oz' | 'g';
};

async function shippoFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SHIPPO_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `ShippoToken ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shippo ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as T;
}

export async function shippoCreateAddress(token: string, body: ShippoAddressInput): Promise<{ object_id: string }> {
  return shippoFetch(token, '/addresses/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type ShippoShipmentRate = {
  object_id: string;
  amount: string;
  currency?: string;
  provider: string;
  servicelevel: { name: string; token?: string };
  estimated_days?: number | null;
  duration_terms?: string | null;
  attributes?: string[];
  provider_image_200?: string;
};

export type ShippoShipmentResponse = {
  object_id: string;
  rates: ShippoShipmentRate[];
  status: string;
};

export async function shippoCreateShipment(
  token: string,
  payload: {
    address_from: string;
    address_to: string;
    parcels: unknown[];
    async?: boolean;
  },
): Promise<ShippoShipmentResponse> {
  return shippoFetch(token, '/shipments/', {
    method: 'POST',
    body: JSON.stringify({ ...payload, async: payload.async ?? false }),
  });
}

export type ShippoTransactionResponse = {
  object_id: string;
  status: string;
  label_url?: string;
  tracking_number?: string;
  tracking_url_provider?: string;
  rate: { object_id: string; provider: string; amount: string; servicelevel: { name: string } };
  eta?: string;
};

export async function shippoPurchaseLabel(token: string, rateObjectId: string): Promise<ShippoTransactionResponse> {
  return shippoFetch(token, '/transactions/', {
    method: 'POST',
    body: JSON.stringify({ rate: rateObjectId, label_file_type: 'PDF', async: false }),
  });
}
