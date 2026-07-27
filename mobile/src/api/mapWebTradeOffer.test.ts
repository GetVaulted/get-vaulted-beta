import { describe, expect, it } from 'vitest';
import {
  mapMobileCashToWeb,
  mapWebCashDifference,
  mapWebTradeOfferDetailToVm,
  mapWebTradeStatus,
} from './mapWebTradeOffer';

describe('mapWebTradeOffer', () => {
  it('maps pending to awaiting_response', () => {
    expect(mapWebTradeStatus('pending')).toBe('awaiting_response');
    expect(mapWebTradeStatus('countered')).toBe('countered');
    expect(mapWebTradeStatus('cancelled')).toBe('declined');
  });

  it('maps cash directions between web and mobile', () => {
    expect(mapWebCashDifference(25, 0)).toBe(25);
    expect(mapWebCashDifference(0, 10)).toBe(-10);
    expect(mapMobileCashToWeb(15)).toEqual({ proposerCashUsd: 15, recipientCashUsd: 0 });
    expect(mapMobileCashToWeb(-8)).toEqual({ proposerCashUsd: 0, recipientCashUsd: 8 });
  });

  it('maps web offer detail into TradeOfferVM', () => {
    const vm = mapWebTradeOfferDetailToVm({
      id: 'trade_1',
      status: 'pending',
      proposerId: 'sender',
      recipientId: 'receiver',
      proposerUsername: 'sender',
      recipientUsername: 'receiver',
      proposerCashUsd: 5,
      recipientCashUsd: 0,
      messageToRecipient: 'hello',
      conversationId: 'thread_1',
      cashPaidAt: '2026-01-03T00:00:00.000Z',
      expiresAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      items: [
        {
          id: 'i1',
          side: 'recipient',
          listingId: 'req_1',
          listingTitleSnapshot: 'Requested card',
          listingImageUrlSnapshot: 'https://img/req.jpg',
          listingCategorySnapshot: 'Trading Cards',
          listingConditionSnapshot: 'PSA 10',
          listingPriceUsdSnapshot: 200,
        },
        {
          id: 'i2',
          side: 'proposer',
          listingId: 'off_1',
          listingTitleSnapshot: 'Offered card',
          listingImageUrlSnapshot: null,
          listingCategorySnapshot: 'Trading Cards',
          listingConditionSnapshot: 'Raw',
          listingPriceUsdSnapshot: 150,
        },
      ],
    });

    expect(vm).not.toBeNull();
    expect(vm?.status).toBe('awaiting_response');
    expect(vm?.sender_id).toBe('sender');
    expect(vm?.recipient_id).toBe('receiver');
    expect(vm?.cash_difference).toBe(5);
    expect(vm?.conversation_id).toBe('thread_1');
    expect(vm?.cash_paid_at).toBe('2026-01-03T00:00:00.000Z');
    expect(vm?.requested.title).toBe('Requested card');
    expect(vm?.offered).toHaveLength(1);
  });
});
