import { fetchWebApi } from './webListingsRepository';

export type MarketplaceCheckoutShipping = {
  buyerAddressId?: string;
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
};

export type MarketplaceTaxEstimate = {
  taxUsd: number;
  collectTax: boolean;
  note: string | null;
};

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function submitMarketplaceOffer(
  accessToken: string,
  args: { listingId: string; amountUsd: number; message?: string },
): Promise<{ id: string; status: string; amountUsd: number }> {
  const res = await fetchWebApi('/api/offers', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      listingId: args.listingId,
      amountUsd: args.amountUsd,
      message: args.message?.trim() || undefined,
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    offer?: { id: string; status: string; amountUsd: number };
    error?: string;
  };
  if (!res.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Offer could not be sent.');
  }
  if (!body?.offer?.id) throw new Error('Offer could not be sent.');
  return body.offer;
}

export async function startMarketplaceBuyNowCheckout(
  accessToken: string,
  args: {
    listingId: string;
    shipping: MarketplaceCheckoutShipping;
    successPath?: string;
    cancelPath?: string;
  },
): Promise<string> {
  const res = await fetchWebApi('/api/checkout', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      kind: 'buy_now',
      listingId: args.listingId,
      shipping: args.shipping,
      successPath: args.successPath ?? '/account/orders',
      cancelPath: args.cancelPath ?? `/checkout/${args.listingId}`,
    }),
  });
  const body = (await res.json().catch(() => null)) as { url?: string; error?: string };
  if (!res.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Checkout could not start.');
  }
  const url = body?.url?.trim();
  if (!url) throw new Error('Checkout could not start.');
  return url;
}

export async function startMarketplaceLayawayCheckout(
  accessToken: string,
  args: {
    listingId: string;
    planType: 'thirty_day' | 'sixty_day';
    shipping: MarketplaceCheckoutShipping;
    successPath?: string;
    cancelPath?: string;
  },
): Promise<{ url: string; layawayId?: string }> {
  const res = await fetchWebApi('/api/checkout', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      kind: 'layaway_deposit',
      listingId: args.listingId,
      planType: args.planType,
      termsAcknowledged: true,
      shipping: args.shipping,
      successPath: args.successPath ?? '/account/layaways',
      cancelPath: args.cancelPath ?? `/checkout/${args.listingId}?mode=layaway`,
    }),
  });
  const body = (await res.json().catch(() => null)) as { url?: string; layawayId?: string; error?: string };
  if (!res.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Layaway checkout could not start.');
  }
  const url = body?.url?.trim();
  if (!url) throw new Error('Layaway checkout could not start.');
  return { url, layawayId: body?.layawayId };
}

export async function fetchMarketplaceCheckoutTaxEstimate(
  accessToken: string,
  args: {
    itemPriceUsd: number;
    shippingPriceUsd: number;
    shipping: MarketplaceCheckoutShipping;
  },
): Promise<MarketplaceTaxEstimate> {
  const res = await fetchWebApi('/api/checkout/tax-estimate', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      itemPriceUsd: args.itemPriceUsd,
      shippingPriceUsd: args.shippingPriceUsd,
      shipping: {
        shipRecipientName: args.shipping.shipRecipientName,
        shipAddress: args.shipping.shipAddress,
        shipCity: args.shipping.shipCity,
        shipState: args.shipping.shipState,
        shipZip: args.shipping.shipZip,
        shipCountry: args.shipping.shipCountry,
      },
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    taxUsd?: number;
    collectTax?: boolean;
    note?: string;
    error?: string;
  };
  if (!res.ok) {
    return { taxUsd: 0, collectTax: false, note: body?.error ?? 'Tax calculated at checkout.' };
  }
  return {
    taxUsd: typeof body?.taxUsd === 'number' ? body.taxUsd : 0,
    collectTax: body?.collectTax === true,
    note: typeof body?.note === 'string' ? body.note : null,
  };
}
