import { afterEach, describe, expect, it } from 'vitest';
import {
  beginLivePlaybackCommerceHold,
  endLivePlaybackCommerceHold,
  isLivePlaybackCommerceHoldActive,
  resetLivePlaybackCommerceHoldForTests,
  withLivePlaybackCommerceHold,
} from './livePlaybackCommerceHold';
import { shouldSuspendLiveStageMediaWhileCommerceHold } from './livePlaybackAppState';

describe('livePlaybackCommerceHold', () => {
  afterEach(() => {
    resetLivePlaybackCommerceHoldForTests();
  });

  it('nests begin/end and clears when balanced', () => {
    expect(isLivePlaybackCommerceHoldActive()).toBe(false);
    beginLivePlaybackCommerceHold();
    beginLivePlaybackCommerceHold();
    expect(isLivePlaybackCommerceHoldActive()).toBe(true);
    endLivePlaybackCommerceHold();
    expect(isLivePlaybackCommerceHoldActive()).toBe(true);
    endLivePlaybackCommerceHold();
    expect(isLivePlaybackCommerceHoldActive()).toBe(false);
  });

  it('withLivePlaybackCommerceHold clears even when fn throws', async () => {
    await expect(
      withLivePlaybackCommerceHold(async () => {
        expect(isLivePlaybackCommerceHoldActive()).toBe(true);
        throw new Error('stripe_cancel');
      }),
    ).rejects.toThrow('stripe_cancel');
    expect(isLivePlaybackCommerceHoldActive()).toBe(false);
  });

  it('does not suspend Stage media for background while commerce hold is active', () => {
    expect(shouldSuspendLiveStageMediaWhileCommerceHold('background', false)).toBe(true);
    expect(shouldSuspendLiveStageMediaWhileCommerceHold('background', true)).toBe(false);
    expect(shouldSuspendLiveStageMediaWhileCommerceHold('inactive', true)).toBe(false);
  });
});
