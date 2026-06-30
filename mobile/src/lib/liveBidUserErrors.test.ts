import { describe, expect, it } from 'vitest';
import {
  LIVE_BID_OUTBID_CODE,
  LiveBidError,
  resolveLiveBidFailureDisplay,
} from './liveBidUserErrors';

describe('resolveLiveBidFailureDisplay', () => {
  it('maps outbid API errors to friendly copy', () => {
    const display = resolveLiveBidFailureDisplay(
      new LiveBidError('Someone else bid first. Next bid is $12.00.', {
        code: LIVE_BID_OUTBID_CODE,
        minNextBidUsd: 12,
        status: 409,
      }),
    );
    expect(display.kind).toBe('outbid');
    expect(display.title).toBe('Outbid');
    expect(display.message).toContain('Someone else bid first');
    expect(display.message).toContain('$12.00');
  });

  it('treats stale min-bid messages as outbid', () => {
    const display = resolveLiveBidFailureDisplay(new Error('Bid must be at least $15.00.'));
    expect(display.kind).toBe('outbid');
    expect(display.message).toContain('Someone else bid first');
  });
});
