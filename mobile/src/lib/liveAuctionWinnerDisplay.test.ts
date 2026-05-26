import { describe, expect, it } from 'vitest';
import { formatAuctionLeaderLine, parsePurchaseCompletedCelebration } from './liveAuctionWinnerDisplay';

describe('liveAuctionWinnerDisplay', () => {
  it('shows winning handle from server username', () => {
    expect(formatAuctionLeaderLine({ lastHighBidderUsername: 'vault_fan' })).toBe('Winning: @vault_fan');
  });

  it('parses purchase_completed celebration payloads', () => {
    expect(
      parsePurchaseCompletedCelebration({
        itemId: 'x',
        winnerUsername: 'buyer1',
        winningAmountUsd: 12,
      })?.kind,
    ).toBe('sold');
    expect(parsePurchaseCompletedCelebration({ itemId: 'x', noBids: true })?.kind).toBe('no_bids');
  });
});
