/** Design baseline — Pro Max-class portrait width where marketplace density was tuned. */
export const MARKETPLACE_REF_WIDTH = 430;

export const MARKETPLACE_TEXT_PROPS = {
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
} as const;

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
  return windowWidth < 410 || windowHeight < 860;
}

/** Normalize typography and spacing to window width — no device model checks. */
export function marketplaceUiScale(windowWidth: number): number {
  const safe = Math.max(1, windowWidth);
  return Math.min(1, Math.max(0.86, safe / MARKETPLACE_REF_WIDTH));
}

export function marketplaceFontSize(base: number, scale: number): number {
  return Math.max(1, Math.round(base * scale));
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
  const tabBarClearance = Math.round(Math.max(88, 64 + bottomInset) + 16);

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
