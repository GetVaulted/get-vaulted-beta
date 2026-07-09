import { tradeFeeUsdForTier } from '../lib/tradeFeeAmounts';
import type {
  ListingLite,
  ProfileLite,
  ShippingWeightTier,
  TradeOfferStatus,
  TradeOfferVM,
} from '../types/tradeOffers';

export type WebTradeOfferItem = {
  id: string;
  side: 'proposer' | 'recipient';
  listingId: string;
  listingTitleSnapshot: string;
  listingImageUrlSnapshot: string | null;
  listingCategorySnapshot: string;
  listingConditionSnapshot: string;
  listingPriceUsdSnapshot: number;
};

export type WebTradeOfferDetail = {
  id: string;
  status: string;
  proposerId: string;
  recipientId: string;
  proposerUsername: string | null;
  recipientUsername: string | null;
  proposerCashUsd: number;
  recipientCashUsd: number;
  messageToRecipient: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: WebTradeOfferItem[];
};

function profileLite(id: string, username: string | null): ProfileLite {
  return {
    id,
    username,
    display_name: username,
    avatar_url: null,
  };
}

function listingFromSnapshot(item: WebTradeOfferItem): ListingLite {
  return {
    id: item.listingId,
    title: item.listingTitleSnapshot,
    price: item.listingPriceUsdSnapshot,
    currency: 'usd',
    media_urls: item.listingImageUrlSnapshot ?? '',
    condition: item.listingConditionSnapshot,
    authentication_status: 'unknown',
  };
}

/** Maps Prisma trade statuses to mobile feed/display statuses. */
export function mapWebTradeStatus(status: string): TradeOfferStatus {
  if (status === 'pending') return 'awaiting_response';
  if (status === 'cancelled' || status === 'expired') return 'declined';
  return status as TradeOfferStatus;
}

export function mapWebCashDifference(proposerCashUsd: number, recipientCashUsd: number): number {
  if (proposerCashUsd > 0) return proposerCashUsd;
  if (recipientCashUsd > 0) return -recipientCashUsd;
  return 0;
}

export function mapMobileCashToWeb(cashDifference: number): {
  proposerCashUsd: number;
  recipientCashUsd: number;
} {
  if (cashDifference > 0) return { proposerCashUsd: cashDifference, recipientCashUsd: 0 };
  if (cashDifference < 0) return { proposerCashUsd: 0, recipientCashUsd: Math.abs(cashDifference) };
  return { proposerCashUsd: 0, recipientCashUsd: 0 };
}

export type WebTradeOfferListItem = {
  id: string;
  status: string;
  proposerId: string;
  recipientId: string;
  proposerUsername?: string | null;
  recipientUsername?: string | null;
  proposerCashUsd?: number;
  recipientCashUsd?: number;
  messageToRecipient?: string | null;
  createdAt?: string;
  updatedAt: string;
  expiresAt?: string | null;
  items?: WebTradeOfferItem[];
  counterpartyUsername?: string | null;
  offeredCount?: number;
  requestedCount?: number;
};

export function mapWebTradeOfferListItemToVm(offer: WebTradeOfferListItem): TradeOfferVM | null {
  if (offer.items?.length) {
    return mapWebTradeOfferDetailToVm({
      id: offer.id,
      status: offer.status,
      proposerId: offer.proposerId,
      recipientId: offer.recipientId,
      proposerUsername: offer.proposerUsername ?? null,
      recipientUsername: offer.recipientUsername ?? null,
      proposerCashUsd: offer.proposerCashUsd ?? 0,
      recipientCashUsd: offer.recipientCashUsd ?? 0,
      messageToRecipient: offer.messageToRecipient ?? null,
      expiresAt: offer.expiresAt ?? null,
      createdAt: offer.createdAt ?? offer.updatedAt,
      updatedAt: offer.updatedAt,
      items: offer.items,
    });
  }

  const tier: ShippingWeightTier = 'cards_slabs';
  const partnerUsername = offer.counterpartyUsername ?? offer.recipientUsername ?? offer.proposerUsername ?? null;
  const sender = profileLite(offer.proposerId, offer.proposerUsername ?? null);
  const recipient = profileLite(offer.recipientId, offer.recipientUsername ?? partnerUsername);
  const placeholderListing = (id: string, title: string): ListingLite => ({
    id,
    title,
    price: 0,
    currency: 'usd',
    media_urls: '',
    condition: null,
    authentication_status: 'unknown',
  });

  return {
    id: offer.id,
    status: mapWebTradeStatus(offer.status),
    sender_id: offer.proposerId,
    recipient_id: offer.recipientId,
    requested_item_id: `${offer.id}:requested`,
    offered_item_ids: [`${offer.id}:offered`],
    cash_difference: mapWebCashDifference(offer.proposerCashUsd ?? 0, offer.recipientCashUsd ?? 0),
    message: offer.messageToRecipient ?? null,
    trade_fee: tradeFeeUsdForTier(tier),
    shipping_weight_tier: tier,
    label_error_message: null,
    updated_at: offer.updatedAt,
    sender,
    recipient,
    requested: placeholderListing(`${offer.id}:requested`, 'Requested item'),
    offered: [placeholderListing(`${offer.id}:offered`, `${offer.offeredCount ?? 1} offered item(s)`)],
  };
}

export function mapWebTradeOfferDetailToVm(
  offer: WebTradeOfferDetail,
  options?: { shippingWeightTier?: ShippingWeightTier | null },
): TradeOfferVM | null {
  const requestedItems = offer.items.filter((i) => i.side === 'recipient');
  const offeredItems = offer.items.filter((i) => i.side === 'proposer');
  const requested = requestedItems[0];
  if (!requested || offeredItems.length === 0) return null;

  const tier = options?.shippingWeightTier ?? 'cards_slabs';
  return {
    id: offer.id,
    status: mapWebTradeStatus(offer.status),
    sender_id: offer.proposerId,
    recipient_id: offer.recipientId,
    requested_item_id: requested.listingId,
    offered_item_ids: offeredItems.map((i) => i.listingId),
    cash_difference: mapWebCashDifference(offer.proposerCashUsd, offer.recipientCashUsd),
    message: offer.messageToRecipient,
    trade_fee: tradeFeeUsdForTier(tier),
    shipping_weight_tier: tier,
    label_error_message: null,
    updated_at: offer.updatedAt,
    sender: profileLite(offer.proposerId, offer.proposerUsername),
    recipient: profileLite(offer.recipientId, offer.recipientUsername),
    requested: listingFromSnapshot(requested),
    offered: offeredItems.map(listingFromSnapshot),
  };
}
