import { tradeFeeUsdForTier } from '../lib/tradeFeeAmounts';
import type {
  ListingLite,
  ProfileLite,
  ShippingWeightTier,
  TradeOfferStatus,
  TradeOfferVM,
  TradePartyFulfillmentVM,
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

export type WebTradePartyFulfillmentFields = {
  proposerPlatformFeePaidAt?: string | null;
  recipientPlatformFeePaidAt?: string | null;
  proposerLabelUrl?: string | null;
  recipientLabelUrl?: string | null;
  proposerTrackingNumber?: string | null;
  recipientTrackingNumber?: string | null;
  proposerTrackingUrl?: string | null;
  recipientTrackingUrl?: string | null;
  proposerLabelPurchasedAt?: string | null;
  recipientLabelPurchasedAt?: string | null;
  proposerLabelErrorMessage?: string | null;
  recipientLabelErrorMessage?: string | null;
  proposerShippedAt?: string | null;
  recipientShippedAt?: string | null;
  proposerReceivedAt?: string | null;
  recipientReceivedAt?: string | null;
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
  conversationId?: string | null;
  cashPaidAt?: string | null;
  proposerDepositPaidAt?: string | null;
  recipientDepositPaidAt?: string | null;
  securityDepositCents?: number | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: WebTradeOfferItem[];
} & WebTradePartyFulfillmentFields;

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

function mapPartyFulfillment(
  offer: WebTradePartyFulfillmentFields,
  side: 'proposer' | 'recipient',
): TradePartyFulfillmentVM {
  const isProposer = side === 'proposer';
  return {
    platform_fee_paid_at: (isProposer ? offer.proposerPlatformFeePaidAt : offer.recipientPlatformFeePaidAt) ?? null,
    label_url: (isProposer ? offer.proposerLabelUrl : offer.recipientLabelUrl) ?? null,
    tracking_number: (isProposer ? offer.proposerTrackingNumber : offer.recipientTrackingNumber) ?? null,
    tracking_url: (isProposer ? offer.proposerTrackingUrl : offer.recipientTrackingUrl) ?? null,
    label_purchased_at: (isProposer ? offer.proposerLabelPurchasedAt : offer.recipientLabelPurchasedAt) ?? null,
    label_error_message: (isProposer ? offer.proposerLabelErrorMessage : offer.recipientLabelErrorMessage) ?? null,
    shipped_at: (isProposer ? offer.proposerShippedAt : offer.recipientShippedAt) ?? null,
    received_at: (isProposer ? offer.proposerReceivedAt : offer.recipientReceivedAt) ?? null,
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
  conversationId?: string | null;
  cashPaidAt?: string | null;
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
      conversationId: offer.conversationId ?? null,
      cashPaidAt: offer.cashPaidAt ?? null,
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
    conversation_id: offer.conversationId?.trim() || null,
    cash_paid_at: offer.cashPaidAt?.trim() || null,
    proposer_deposit_paid_at: null,
    recipient_deposit_paid_at: null,
    security_deposit_cents: null,
    trade_fee: tradeFeeUsdForTier(tier),
    shipping_weight_tier: tier,
    label_error_message: null,
    updated_at: offer.updatedAt,
    sender,
    recipient,
    requested: placeholderListing(`${offer.id}:requested`, 'Requested item'),
    offered: [placeholderListing(`${offer.id}:offered`, `${offer.offeredCount ?? 1} offered item(s)`)],
    proposer_fulfillment: null,
    recipient_fulfillment: null,
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
  const proposerFulfillment = mapPartyFulfillment(offer, 'proposer');
  const recipientFulfillment = mapPartyFulfillment(offer, 'recipient');
  const labelError =
    proposerFulfillment.label_error_message || recipientFulfillment.label_error_message || null;

  return {
    id: offer.id,
    status: mapWebTradeStatus(offer.status),
    sender_id: offer.proposerId,
    recipient_id: offer.recipientId,
    requested_item_id: requested.listingId,
    offered_item_ids: offeredItems.map((i) => i.listingId),
    cash_difference: mapWebCashDifference(offer.proposerCashUsd, offer.recipientCashUsd),
    message: offer.messageToRecipient,
    conversation_id: offer.conversationId?.trim() || null,
    cash_paid_at: offer.cashPaidAt?.trim() || null,
    proposer_deposit_paid_at: offer.proposerDepositPaidAt?.trim() || null,
    recipient_deposit_paid_at: offer.recipientDepositPaidAt?.trim() || null,
    security_deposit_cents:
      typeof offer.securityDepositCents === 'number' ? offer.securityDepositCents : null,
    trade_fee: tradeFeeUsdForTier(tier),
    shipping_weight_tier: tier,
    label_error_message: labelError,
    updated_at: offer.updatedAt,
    sender: profileLite(offer.proposerId, offer.proposerUsername),
    recipient: profileLite(offer.recipientId, offer.recipientUsername),
    requested: listingFromSnapshot(requested),
    offered: offeredItems.map(listingFromSnapshot),
    proposer_fulfillment: proposerFulfillment,
    recipient_fulfillment: recipientFulfillment,
  };
}
