import { spacing } from '../theme';

/** Max tile width on phones/tablets — prevents oversized cards on iPad. */
export const LIVE_DISCOVERY_CARD_MAX_W = 220;
export const LIVE_DISCOVERY_GRID_PAD = spacing.lg;
export const LIVE_DISCOVERY_GRID_GAP = spacing.sm;

export type LiveDiscoveryGridMetrics = {
  cols: number;
  cardWidth: number;
  pad: number;
  gap: number;
};

/** Responsive live show grid: 2 cols on phone, up to 4 on wide tablets with capped tile width. */
export function computeLiveDiscoveryGrid(windowWidth: number): LiveDiscoveryGridMetrics {
  const pad = LIVE_DISCOVERY_GRID_PAD;
  const gap = LIVE_DISCOVERY_GRID_GAP;
  const inner = Math.max(1, windowWidth - pad * 2);
  const cols = Math.max(
    2,
    Math.min(4, Math.floor((inner + gap) / (LIVE_DISCOVERY_CARD_MAX_W + gap))),
  );
  const cardWidth = Math.min(LIVE_DISCOVERY_CARD_MAX_W, (inner - gap * (cols - 1)) / cols);
  return { cols, cardWidth, pad, gap };
}
