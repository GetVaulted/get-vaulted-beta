import { describe, expect, it } from 'vitest';
import {
  computeMarketplaceGrid,
  computeMarketplaceLayoutMetrics,
  isCompactMarketplaceLayout,
  marketplaceUiScale,
  MARKETPLACE_GRID_GAP,
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

describe('computeMarketplaceGrid', () => {
  it('uses 2 columns on phone content widths', () => {
    const grid = computeMarketplaceGrid(358);
    expect(grid.cols).toBe(2);
    expect(grid.cardWidth).toBe(Math.floor((358 - MARKETPLACE_GRID_GAP) / 2));
  });

  it('adds columns on wide tablet content widths (capped at 4)', () => {
    expect(computeMarketplaceGrid(760).cols).toBeGreaterThanOrEqual(3);
    expect(computeMarketplaceGrid(2000).cols).toBe(4);
  });

  it('fills the row exactly: cols * cardWidth + gaps <= contentWidth', () => {
    for (const w of [320, 358, 430, 700, 900, 1200]) {
      const g = computeMarketplaceGrid(w);
      const used = g.cols * g.cardWidth + g.gap * (g.cols - 1);
      expect(used).toBeLessThanOrEqual(w);
      expect(g.cardWidth).toBeGreaterThan(0);
    }
  });

  it('never drops below 2 columns even on tiny widths', () => {
    expect(computeMarketplaceGrid(1).cols).toBe(2);
  });
});
