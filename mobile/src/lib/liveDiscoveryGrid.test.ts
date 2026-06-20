import { describe, expect, it } from 'vitest';
import { computeLiveDiscoveryGrid, LIVE_DISCOVERY_CARD_MAX_W } from './liveDiscoveryGrid';

describe('computeLiveDiscoveryGrid', () => {
  it('uses 2 columns on phone widths', () => {
    const phone = computeLiveDiscoveryGrid(393);
    expect(phone.cols).toBe(2);
    expect(phone.cardWidth).toBeLessThanOrEqual(LIVE_DISCOVERY_CARD_MAX_W);
  });

  it('adds columns on iPad without oversized tiles', () => {
    const ipad = computeLiveDiscoveryGrid(820);
    expect(ipad.cols).toBeGreaterThan(2);
    expect(ipad.cardWidth).toBeLessThanOrEqual(LIVE_DISCOVERY_CARD_MAX_W);
  });
});
