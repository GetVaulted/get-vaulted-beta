import { resolvedBottomInset } from './bottomInset';
import {
  APP_REF_WIDTH,
  APP_TEXT_PROPS,
  appFontSize,
  appUniformScale,
  isCompactAppLayout,
} from './appUiScale';

/** Design baseline — Pro Max-class portrait width where marketplace density was tuned. */
export const MARKETPLACE_REF_WIDTH = APP_REF_WIDTH;

export const MARKETPLACE_TEXT_PROPS = APP_TEXT_PROPS;

export type MarketplaceLayoutMetrics = {
  windowWidth: number;
  windowHeight: number;
  scale: number;
  compact: boolean;
  horizontalPadding: number;
  contentWidth: number;
  heroHeight: number;
  listingCardWidth: number;
  listingCardHeight: number;
  chipMinWidth: number;
  chipHeight: number;
  tabBarClearance: number;
};

export function isCompactMarketplaceLayout(windowWidth: number, windowHeight: number): boolean {
  return isCompactAppLayout(windowWidth, windowHeight);
}

/** Max grid tile width — keeps cards from ballooning on tablets. */
export const MARKETPLACE_GRID_MAX_CARD_W = 220;
/** Gap between grid cards (both axes). */
export const MARKETPLACE_GRID_GAP = 10;

export type MarketplaceGridMetrics = { cols: number; cardWidth: number; gap: number };

/**
 * Continuous browse grid: 2 columns on phones, up to 4 on wide tablets, with a capped tile width so
 * the vault keeps scrolling vertically instead of showing a couple of horizontal rails.
 */
export function computeMarketplaceGrid(contentWidth: number): MarketplaceGridMetrics {
  const gap = MARKETPLACE_GRID_GAP;
  const inner = Math.max(1, contentWidth);
  const cols = Math.max(
    2,
    Math.min(4, Math.floor((inner + gap) / (MARKETPLACE_GRID_MAX_CARD_W + gap))),
  );
  const cardWidth = Math.floor((inner - gap * (cols - 1)) / cols);
  return { cols, cardWidth, gap };
}

/** Normalize typography and spacing to window width — no device model checks. */
export function marketplaceUiScale(windowWidth: number): number {
  return appUniformScale(windowWidth);
}

export function marketplaceFontSize(base: number, scale: number): number {
  return appFontSize(base, scale);
}

export function computeMarketplaceLayoutMetrics(
  windowWidth: number,
  windowHeight: number,
  bottomInset = 0,
): MarketplaceLayoutMetrics {
  const windowW = Math.max(1, windowWidth);
  const windowH = Math.max(1, windowHeight);
  const scale = marketplaceUiScale(windowW);
  const compact = isCompactMarketplaceLayout(windowW, windowH);

  const horizontalPadding = Math.round((compact ? 12 : 16) * scale);
  const contentWidth = Math.max(1, windowW - horizontalPadding * 2);

  const listingCardWidth = Math.round((compact ? 136 : 152) * scale);
  const listingCardHeight = Math.round(listingCardWidth * (208 / 152));

  const chipHeight = Math.round((compact ? 46 : 56) * scale);
  const chipMinWidth = Math.round((compact ? 72 : 88) * scale);

  const heroHeight = Math.round((compact ? 108 : 132) * scale);
  const tabBarClearance = Math.round(Math.max(88, 64 + resolvedBottomInset(bottomInset)) + 16);

  return {
    windowWidth: windowW,
    windowHeight: windowH,
    scale,
    compact,
    horizontalPadding,
    contentWidth,
    heroHeight,
    listingCardWidth,
    listingCardHeight,
    chipMinWidth,
    chipHeight,
    tabBarClearance,
  };
}
