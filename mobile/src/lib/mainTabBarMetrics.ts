import { spacing } from '../theme';
import { resolvedBottomInset } from './screenSafeInsets';

/** How far `LiveTabOrb` lifts into the transparent glow pad. */
export const LIVE_ORB_LIFT = 14;
/** Transparent band above the dark bar so the Live orb glow isn’t clipped. */
export const TAB_BAR_GLOW_PAD = LIVE_ORB_LIFT + 8;

/** Matches `VaultTabBar` glow pad + row padding + tab row min height. */
const TAB_BAR_ROW_PAD = 12;
const TAB_BAR_ROW_HEIGHT = 52;

/** Vertical space from bottom safe area through tab bar (glow pad is inside layout). */
export function mainTabBarClearance(bottomSafeInset: number): number {
  const bottom = resolvedBottomInset(bottomSafeInset);
  return TAB_BAR_GLOW_PAD + TAB_BAR_ROW_PAD + TAB_BAR_ROW_HEIGHT + bottom + spacing.sm;
}
