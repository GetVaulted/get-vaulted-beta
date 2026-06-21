import { describe, expect, it } from 'vitest';
import { resolveLiveCustomBidPayload, validateLiveCustomBidAmount } from './liveCustomBid';

describe('liveCustomBid', () => {
  it('validates minimum bid', () => {
    expect(validateLiveCustomBidAmount(25, 4)).toBeNull();
    expect(validateLiveCustomBidAmount(3, 4)).toMatch(/Minimum bid/);
    expect(validateLiveCustomBidAmount(NaN, 4)).toMatch(/valid bid/);
  });

  it('maps exact bid to amount only', () => {
    expect(resolveLiveCustomBidPayload({ mode: 'exact', enteredUsd: 25, minNextBidUsd: 4 })).toEqual({
      amountUsd: 25,
    });
  });

  it('maps reserve bid to min now plus max proxy', () => {
    expect(resolveLiveCustomBidPayload({ mode: 'reserve', enteredUsd: 25, minNextBidUsd: 4 })).toEqual({
      amountUsd: 4,
      maxProxyUsd: 25,
    });
  });
});
