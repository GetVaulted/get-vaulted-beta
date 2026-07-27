import { apiFailureErrorMessage } from '../lib/betaApiResponse';
import { fetchWebApiMobileWithSellerAuth, resolveSellerAccessToken } from '../lib/resolveSellerAccessToken';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { parseWebApiJsonBody, readWebApiResponseText } from '../lib/webApiResponse';
import {
  mapMobileCashToWeb,
  mapWebTradeOfferDetailToVm,
  mapWebTradeOfferListItemToVm,
  type WebTradeOfferDetail,
  type WebTradeOfferListItem,
} from './mapWebTradeOffer';
import type { ShippingWeightTier, TradeOfferVM } from '../types/tradeOffers';

export function isWebTradeApiConfigured(): boolean {
  return Boolean(getWebApiBaseUrl());
}

async function tradeFetch(path: string, init?: RequestInit, accessTokenFallback?: string): Promise<Response> {
  const token = await resolveSellerAccessToken(accessTokenFallback);
  return fetchWebApiMobileWithSellerAuth(path, token, init);
}

function improveStaleTradeServerAuthMessage(message: string): string {
  if (!/sign in required/i.test(message)) return message;
  return 'You are signed in, but the trade API has not finished deploying yet. Pull down to refresh in a minute.';
}

async function parseTradeApiError(res: Response): Promise<string> {
  const text = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{ error?: string }>(text);
  const raw = apiFailureErrorMessage(res, text) ?? body?.error ?? 'Trade request failed.';
  return improveStaleTradeServerAuthMessage(raw);
}

async function tradePost(path: string, body?: unknown): Promise<void> {
  const res = await tradeFetch(path, {
    method: 'POST',
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseTradeApiError(res));
}

async function tradeGet<T extends Record<string, unknown>>(path: string, accessTokenFallback?: string): Promise<T> {
  const res = await tradeFetch(path, { method: 'GET' }, accessTokenFallback);
  const text = await readWebApiResponseText(res);
  const parsed = parseWebApiJsonBody<T>(text);
  if (!res.ok) {
    const raw =
      apiFailureErrorMessage(res, text) ?? (parsed as { error?: string } | null)?.error ?? 'Trade request failed.';
    throw new Error(improveStaleTradeServerAuthMessage(raw));
  }
  if (!parsed) throw new Error('Trade response was not valid JSON.');
  return parsed;
}

export async function createTradeOfferViaWeb(params: {
  requestedListingIds: string[];
  offeredListingIds: string[];
  cashDifference: number;
  message: string | null;
  weightTier: ShippingWeightTier;
}): Promise<string> {
  const cash = mapMobileCashToWeb(params.cashDifference);
  const res = await tradeFetch('/api/trade/offers', {
    method: 'POST',
    body: JSON.stringify({
      requestedListingIds: params.requestedListingIds,
      offeredListingIds: params.offeredListingIds,
      proposerCashUsd: cash.proposerCashUsd,
      recipientCashUsd: cash.recipientCashUsd,
      messageToRecipient: params.message?.trim() || undefined,
    }),
  });
  const text = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{ offerId?: string; error?: string }>(text);
  if (!res.ok) {
    throw new Error(apiFailureErrorMessage(res, text) ?? body?.error ?? 'Trade offer could not be sent.');
  }
  if (!body?.offerId) throw new Error('Trade offer could not be sent.');
  void params.weightTier;
  return body.offerId;
}

export async function fetchTradeOfferDetailViaWeb(
  offerId: string,
  options?: { shippingWeightTier?: ShippingWeightTier | null },
): Promise<TradeOfferVM | null> {
  try {
    const body = await tradeGet<{ offer?: WebTradeOfferDetail }>(
      `/api/trade/offers/${encodeURIComponent(offerId)}`,
    );
    if (!body.offer) return null;
    return mapWebTradeOfferDetailToVm(body.offer, options);
  } catch {
    return null;
  }
}

export async function fetchTradeOffersForUserViaWeb(
  _supabaseUserId: string,
  accessTokenFallback?: string,
): Promise<{ offers: TradeOfferVM[]; viewerId: string | null }> {
  const list = await tradeGet<{ offers?: WebTradeOfferListItem[]; viewerId?: string }>(
    '/api/trade/offers',
    accessTokenFallback,
  );
  const viewerId = list.viewerId ?? null;
  const rows = await Promise.all(
    (list.offers ?? []).map(async (row) => {
      const mapped = mapWebTradeOfferListItemToVm(row);
      if (mapped) return mapped;
      return fetchTradeOfferDetailViaWeb(row.id);
    }),
  );
  const offers = rows.filter((row): row is TradeOfferVM => Boolean(row));
  return { offers, viewerId };
}

export async function acceptTradeOfferViaWeb(offerId: string): Promise<void> {
  await tradePost(`/api/trade/offers/${encodeURIComponent(offerId)}/accept`);
}

/** Start Stripe Checkout for this party's $2.99 Get Vaulted platform fee (web/Prisma path). */
export async function createTradePlatformFeeCheckoutViaWeb(
  offerId: string,
): Promise<{ url: string | null; alreadyPaid: boolean }> {
  const res = await tradeFetch(`/api/trade/offers/${encodeURIComponent(offerId)}/platform-fee-checkout`, {
    method: 'POST',
  });
  const text = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{
    error?: string;
    url?: string | null;
    alreadyPaid?: boolean;
  }>(text);
  if (!res.ok) {
    throw new Error(apiFailureErrorMessage(res, text) ?? body?.error ?? 'Could not start platform fee checkout.');
  }
  return {
    url: typeof body?.url === 'string' ? body.url : null,
    alreadyPaid: body?.alreadyPaid === true,
  };
}

/** Opens or resumes the participant-scoped trade MessageThread. */
export async function ensureTradeConversationViaWeb(
  offerId: string,
): Promise<{ threadId: string; href?: string; created: boolean }> {
  const res = await tradeFetch(`/api/trade/offers/${encodeURIComponent(offerId)}/conversation`, {
    method: 'POST',
  });
  const text = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{
    threadId?: string;
    href?: string;
    created?: boolean;
    error?: string;
  }>(text);
  if (!res.ok || !body?.threadId) {
    throw new Error(apiFailureErrorMessage(res, text) ?? body?.error ?? 'Could not open trade chat.');
  }
  return { threadId: body.threadId, href: body.href, created: Boolean(body.created) };
}

/** Start Stripe Checkout for optional on-platform trade cash. */
export async function createTradeCashCheckoutViaWeb(
  offerId: string,
): Promise<{ url: string | null; alreadyPaid: boolean; amountUsd?: number }> {
  const res = await tradeFetch(`/api/trade/offers/${encodeURIComponent(offerId)}/cash-checkout`, {
    method: 'POST',
  });
  const text = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{
    error?: string;
    url?: string | null;
    alreadyPaid?: boolean;
    amountUsd?: number;
  }>(text);
  if (!res.ok) {
    throw new Error(apiFailureErrorMessage(res, text) ?? body?.error ?? 'Could not start cash checkout.');
  }
  return {
    url: typeof body?.url === 'string' ? body.url : null,
    alreadyPaid: body?.alreadyPaid === true,
    amountUsd: typeof body?.amountUsd === 'number' ? body.amountUsd : undefined,
  };
}

export async function createTradeDepositCheckoutViaWeb(
  offerId: string,
): Promise<{ url: string | null; alreadyPaid: boolean; amountUsd?: number }> {
  const res = await tradeFetch(`/api/trade/offers/${encodeURIComponent(offerId)}/deposit-checkout`, {
    method: 'POST',
  });
  const text = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{
    error?: string;
    url?: string | null;
    alreadyPaid?: boolean;
    amountUsd?: number;
  }>(text);
  if (!res.ok) {
    throw new Error(apiFailureErrorMessage(res, text) ?? body?.error ?? 'Could not start deposit checkout.');
  }
  return {
    url: typeof body?.url === 'string' ? body.url : null,
    alreadyPaid: body?.alreadyPaid === true,
    amountUsd: typeof body?.amountUsd === 'number' ? body.amountUsd : undefined,
  };
}

export async function markTradeShippedViaWeb(
  offerId: string,
): Promise<{ alreadyDone: boolean; completed: boolean }> {
  const res = await tradeFetch(`/api/trade/offers/${encodeURIComponent(offerId)}/mark-shipped`, {
    method: 'POST',
  });
  const text = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{ error?: string; alreadyDone?: boolean; completed?: boolean }>(text);
  if (!res.ok) {
    throw new Error(apiFailureErrorMessage(res, text) ?? body?.error ?? 'Could not mark shipped.');
  }
  return {
    alreadyDone: body?.alreadyDone === true,
    completed: body?.completed === true,
  };
}

export async function confirmTradeReceivedViaWeb(
  offerId: string,
): Promise<{ alreadyDone: boolean; completed: boolean }> {
  const res = await tradeFetch(`/api/trade/offers/${encodeURIComponent(offerId)}/confirm-received`, {
    method: 'POST',
  });
  const text = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{ error?: string; alreadyDone?: boolean; completed?: boolean }>(text);
  if (!res.ok) {
    throw new Error(apiFailureErrorMessage(res, text) ?? body?.error ?? 'Could not confirm receipt.');
  }
  return {
    alreadyDone: body?.alreadyDone === true,
    completed: body?.completed === true,
  };
}

export async function openTradeDisputeViaWeb(
  offerId: string,
  reason: string,
): Promise<{ alreadyDone: boolean }> {
  const res = await tradeFetch(`/api/trade/offers/${encodeURIComponent(offerId)}/dispute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  const text = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{ error?: string; alreadyDone?: boolean }>(text);
  if (!res.ok) {
    throw new Error(apiFailureErrorMessage(res, text) ?? body?.error ?? 'Could not open dispute.');
  }
  return { alreadyDone: body?.alreadyDone === true };
}

export async function declineTradeOfferViaWeb(offerId: string): Promise<void> {
  await tradePost(`/api/trade/offers/${encodeURIComponent(offerId)}/decline`);
}

export async function cancelTradeOfferViaWeb(offerId: string): Promise<void> {
  await tradePost(`/api/trade/offers/${encodeURIComponent(offerId)}/cancel`);
}

export async function counterTradeOfferViaWeb(params: {
  offerId: string;
  cashDifference: number;
  message: string;
}): Promise<void> {
  const cash = mapMobileCashToWeb(params.cashDifference);
  await tradePost(`/api/trade/offers/${encodeURIComponent(params.offerId)}/counter`, {
    proposerCashUsd: cash.proposerCashUsd,
    recipientCashUsd: cash.recipientCashUsd,
    messageToRecipient: params.message,
  });
}
