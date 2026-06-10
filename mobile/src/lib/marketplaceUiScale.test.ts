import { describe, expect, it } from 'vitest';
import {
  computeMarketplaceLayoutMetrics,
  isCompactMarketplaceLayout,
  marketplaceUiScale,
  MARKETPLACE_REF_WIDTH,
} from './marketplaceUiScale';

describe('marketplaceUiScale', () => {
  it('uses unit scale at the reference width', () => {
    expect(marketplaceUiScale(MARKETPLACE_REF_WIDTH)).toBe(1);
  });

  it('scales down on narrower windows (display zoom / smaller phones)', () => {
    expect(marketplaceUiScale(393)).toBeCloseTo(393 / MARKETPLACE_REF_WIDTH, 5);
    expect(marketplaceUiScale(393)).toBeLessThan(1);
  });

  it('does not scale up beyond 1 on wider windows', () => {
    expect(marketplaceUiScale(440)).toBe(1);
  });
});

describe('isCompactMarketplaceLayout', () => {
  it('flags compact layouts for narrow or short viewports', () => {
    expect(isCompactMarketplaceLayout(393, 852)).toBe(true);
    expect(isCompactMarketplaceLayout(430, 932)).toBe(false);
    expect(isCompactMarketplaceLayout(440, 956)).toBe(false);
  });
});

describe('computeMarketplaceLayoutMetrics', () => {
  it('derives content width from window minus responsive padding', () => {
    const m = computeMarketplaceLayoutMetrics(430, 932, 34);
    expect(m.contentWidth).toBe(430 - m.horizontalPadding * 2);
    expect(m.scale).toBe(1);
  });

  it('reduces card and hero sizes in compact mode', () => {
    const wide = computeMarketplaceLayoutMetrics(430, 932, 34);
    const compact = computeMarketplaceLayoutMetrics(393, 852, 34);
    expect(compact.listingCardWidth).toBeLessThan(wide.listingCardWidth);
    expect(compact.heroHeight).toBeLessThan(wide.heroHeight);
    expect(compact.chipHeight).toBeLessThan(wide.chipHeight);
  });

  it('reserves scroll bottom space for the tab bar', () => {
    const m = computeMarketplaceLayoutMetrics(430, 932, 34);
    expect(m.tabBarClearance).toBeGreaterThanOrEqual(88);
  });

  it('keeps Pro Max-class widths at unit scale while display-zoom widths shrink', () => {
    const proMax15 = computeMarketplaceLayoutMetrics(430, 932, 34);
    const proMax17 = computeMarketplaceLayoutMetrics(440, 956, 34);
    const displayZoom = computeMarketplaceLayoutMetrics(393, 852, 34);
    expect(proMax15.scale).toBe(1);
    expect(proMax17.scale).toBe(1);
    expect(displayZoom.scale).toBeLessThan(1);
    expect(displayZoom.listingCardWidth).toBeLessThan(proMax15.listingCardWidth);
  });
});
