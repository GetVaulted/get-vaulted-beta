import { describe, expect, it } from 'vitest';
import { liveBidOutbidJsonBody } from './live-bid-user-errors';

describe('liveBidOutbidJsonBody', () => {
  const formatMoney = (n: number) => `$${n.toFixed(2)}`;

  it('returns structured outbid payload with next min bid', () => {
    const body = liveBidOutbidJsonBody({ minNextBidUsd: 25, formatMoney });
    expect(body.code).toBe('LIVE_BID_OUTBID');
    expect(body.error).toContain('Someone else bid first');
    expect(body.error).toContain('$25.00');
    expect(body.minNextBidUsd).toBe(25);
  });

  it('falls back when min bid is unknown', () => {
    const body = liveBidOutbidJsonBody({ formatMoney });
    expect(body.code).toBe('LIVE_BID_OUTBID');
    expect(body.error).toContain('Someone else got there first');
    expect(body.minNextBidUsd).toBeUndefined();
  });
});
