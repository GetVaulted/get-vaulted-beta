import { describe, expect, it } from 'vitest';
import {
  canHostStartLiveAuction,
  isMultiQuantityLiveAuctionItem,
} from './liveAuctionHostStart';

const multiActive = {
  title: '10x Slabs',
  quantity: 8,
  quantityInitial: 10,
  status: 'active' as const,
  lastHighBidderId: null,
  biddingOpen: false,
  auctionEndsAt: null,
};

describe('liveAuctionHostStart', () => {
  it('allows start after no-bid timer end on multi-qty active lot', () => {
    expect(
      canHostStartLiveAuction(
        {
          ...multiActive,
          auctionEndsAt: new Date(Date.now() - 5000).toISOString(),
          biddingOpen: true,
        },
        {
          broadcastOnAir: true,
          lotBidPhase: 'timer_ended_unsettled',
        },
      ),
    ).toBe(true);
  });

  it('detects multi-quantity lots', () => {
    expect(isMultiQuantityLiveAuctionItem({ quantity: 10, quantityInitial: 10 })).toBe(true);
    expect(isMultiQuantityLiveAuctionItem({ quantity: 1, quantityInitial: 1 })).toBe(false);
  });
});
