import { fetchWebApi } from './webListingsRepository';

export type MarketplaceCheckoutShipping = {
  buyerAddressId?: string;
  shipRecipientName: string;
  shipAddress: string;
  shipAddressLine2?: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  selectedShippingRateId?: string;
};

export type MarketplaceCheckoutShippingRate = {
  id: string;
  carrier: string;
  serviceLevel: string;
  estimatedDelivery: string;
  estimatedDays?: number | null;
  amount: string;
  currency: string;
  trackingIncluded: boolean;
  insuranceAvailable: boolean;
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

export type MarketplaceEmbeddedBuyNowResult =
  | { ok: true; paid: true; orderId: string }
  | {
      ok: true;
      requiresAction: true;
      orderId: string;
      clientSecret: string;
      paymentIntentId: string;
      publishableKey?: string;
    }
  | { ok: true; processing: true; orderId: string }
  | { ok: false; error: string; escrowRedirectUrl?: string };

export async function startMarketplaceBuyNowCheckout(
  accessToken: string,
  args: {
    listingId: string;
    shipping: MarketplaceCheckoutShipping;
    paymentMethodId?: string;
    successPath?: string;
    cancelPath?: string;
  },
): Promise<MarketplaceEmbeddedBuyNowResult> {
  const res = await fetchWebApi('/api/checkout', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      kind: 'buy_now',
      embedded: true,
      listingId: args.listingId,
      paymentMethodId: args.paymentMethodId,
      shipping: args.shipping,
      selectedShippingRateId: args.shipping.selectedShippingRateId,
      successPath: args.successPath ?? '/account/orders',
      cancelPath: args.cancelPath ?? `/checkout/${args.listingId}`,
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    embedded?: boolean;
    orderId?: string;
    paid?: boolean;
    requiresAction?: boolean;
    processing?: boolean;
    clientSecret?: string;
    paymentIntentId?: string;
    publishableKey?: string;
    url?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: typeof body?.error === 'string' ? body.error : 'Checkout could not start.',
    };
  }
  if (body?.url?.trim() && !body?.embedded) {
    return { ok: false, error: 'Secure checkout redirect required.', escrowRedirectUrl: body.url.trim() };
  }
  const orderId = body?.orderId?.trim();
  if (!orderId) {
    return { ok: false, error: 'Checkout could not start.' };
  }
  if (body.paid) return { ok: true, paid: true, orderId };
  if (body.requiresAction && body.clientSecret?.trim() && body.paymentIntentId?.trim()) {
    return {
      ok: true,
      requiresAction: true,
      orderId,
      clientSecret: body.clientSecret.trim(),
      paymentIntentId: body.paymentIntentId.trim(),
      publishableKey: body.publishableKey?.trim() || undefined,
    };
  }
  if (body.processing) return { ok: true, processing: true, orderId };
  return { ok: false, error: 'Checkout could not start.' };
}

export async function syncMarketplaceBuyNowPayment(
  accessToken: string,
  orderId: string,
): Promise<MarketplaceEmbeddedBuyNowResult> {
  const res = await fetchWebApi(`/api/orders/${encodeURIComponent(orderId)}/charge-saved`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ sync: true }),
  });
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    requiresAction?: boolean;
    processing?: boolean;
    clientSecret?: string;
    paymentIntentId?: string;
    publishableKey?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: typeof body?.error === 'string' ? body.error : 'Payment could not be confirmed.',
    };
  }
  if (body.ok) return { ok: true, paid: true, orderId };
  if (body.processing) return { ok: true, processing: true, orderId };
  if (body.requiresAction && body.clientSecret?.trim() && body.paymentIntentId?.trim()) {
    return {
      ok: true,
      requiresAction: true,
      orderId,
      clientSecret: body.clientSecret.trim(),
      paymentIntentId: body.paymentIntentId.trim(),
      publishableKey: body.publishableKey?.trim() || undefined,
    };
  }
  return { ok: false, error: body?.error ?? 'Payment could not be confirmed.' };
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
      selectedShippingRateId: args.shipping.selectedShippingRateId,
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

export async function fetchMarketplaceCheckoutShippingRates(
  accessToken: string,
  args: {
    listingId: string;
    shipping: MarketplaceCheckoutShipping;
  },
): Promise<{ rates: MarketplaceCheckoutShippingRate[]; error: string | null; shipFromLabel: string | null }> {
  const res = await fetchWebApi('/api/checkout/shipping-rates', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      listingId: args.listingId,
      buyerAddressId: args.shipping.buyerAddressId,
      shipping: {
        shipRecipientName: args.shipping.shipRecipientName,
        shipAddress: args.shipping.shipAddress,
        shipAddressLine2: args.shipping.shipAddressLine2,
        shipCity: args.shipping.shipCity,
        shipState: args.shipping.shipState,
        shipZip: args.shipping.shipZip,
        shipCountry: args.shipping.shipCountry,
      },
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    rates?: MarketplaceCheckoutShippingRate[];
    error?: string;
    shipFromLabel?: string | null;
  };
  if (!res.ok) {
    return { rates: body?.rates ?? [], error: body?.error ?? 'Shipping rates could not be loaded.', shipFromLabel: null };
  }
  return {
    rates: body?.rates ?? [],
    error: null,
    shipFromLabel: typeof body?.shipFromLabel === 'string' ? body.shipFromLabel : null,
  };
}
