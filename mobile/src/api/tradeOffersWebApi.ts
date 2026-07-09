import { apiFailureErrorMessage } from '../lib/betaApiResponse';
import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { parseWebApiJsonBody, readWebApiResponseText } from '../lib/webApiResponse';
import { getListingsAccessToken } from './webListingsRepository';
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

async function tradeAccessToken(): Promise<string> {
  return getListingsAccessToken();
}

async function parseTradeApiError(res: Response): Promise<string> {
  const text = await readWebApiResponseText(res);
  const body = parseWebApiJsonBody<{ error?: string }>(text);
  return apiFailureErrorMessage(res, text) ?? body?.error ?? 'Trade request failed.';
}

async function tradePost(path: string, body?: unknown): Promise<void> {
  const token = await tradeAccessToken();
  const res = await fetchWebApiAuthed(path, token, {
    method: 'POST',
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseTradeApiError(res));
}

async function tradeGet<T extends Record<string, unknown>>(path: string): Promise<T> {
  const token = await tradeAccessToken();
  const res = await fetchWebApiAuthed(path, token, { method: 'GET' });
  const text = await readWebApiResponseText(res);
  const parsed = parseWebApiJsonBody<T>(text);
  if (!res.ok) {
    throw new Error(apiFailureErrorMessage(res, text) ?? (parsed as { error?: string } | null)?.error ?? 'Trade request failed.');
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
  const token = await tradeAccessToken();
  const res = await fetchWebApiAuthed('/api/trade/offers', token, {
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
): Promise<{ offers: TradeOfferVM[]; viewerId: string | null }> {
  const list = await tradeGet<{ offers?: WebTradeOfferListItem[]; viewerId?: string }>('/api/trade/offers');
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

export async function declineTradeOfferViaWeb(offerId: string): Promise<void> {
  await tradePost(`/api/trade/offers/${encodeURIComponent(offerId)}/decline`);
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
