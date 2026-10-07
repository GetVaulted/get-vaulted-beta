import { describe, expect, it } from 'vitest';
import { jitteredMs, nextFallbackPollDelayMs } from './pollBackoff';

describe('jitteredMs', () => {
  it('stays within the spread', () => {
    expect(jitteredMs(1000, 0.2, () => 0)).toBe(800);
    expect(jitteredMs(1000, 0.2, () => 1)).toBe(1200);
    expect(jitteredMs(1000, 0.2, () => 0.5)).toBe(1000);
  });
});

describe('nextFallbackPollDelayMs', () => {
  const mid = () => 0.5;
  it('starts at the base and grows with consecutive polls', () => {
    expect(nextFallbackPollDelayMs(0, 5000, 20000, mid)).toBe(5000);
    expect(nextFallbackPollDelayMs(1, 5000, 20000, mid)).toBe(7500);
    expect(nextFallbackPollDelayMs(2, 5000, 20000, mid)).toBe(11250);
  });
  it('caps at the max', () => {
    expect(nextFallbackPollDelayMs(20, 5000, 20000, mid)).toBe(20000);
    expect(nextFallbackPollDelayMs(20, 5000, 20000, () => 1)).toBe(24000);
  });
});
