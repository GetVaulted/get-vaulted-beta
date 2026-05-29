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

  it('flags the local viewer as winner when winnerId matches', () => {
    const won = parsePurchaseCompletedCelebration(
      { itemId: 'x', winnerUsername: 'me', winningAmountUsd: 20, winnerId: 'user_1' },
      'user_1',
    );
    expect(won?.kind === 'sold' && won.viewerIsWinner).toBe(true);

    const lost = parsePurchaseCompletedCelebration(
      { itemId: 'x', winnerUsername: 'them', winningAmountUsd: 20, winnerId: 'user_2' },
      'user_1',
    );
    expect(lost?.kind === 'sold' && lost.viewerIsWinner).toBe(false);

    const noViewer = parsePurchaseCompletedCelebration({
      itemId: 'x',
      winnerUsername: 'them',
      winningAmountUsd: 20,
      winnerId: 'user_2',
    });
    expect(noViewer?.kind === 'sold' && noViewer.viewerIsWinner).toBe(false);
  });
});
