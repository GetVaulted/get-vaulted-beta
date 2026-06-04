import { spacing } from '../theme';

/** Matches `VaultTabBar` paddingTop + tab row min height. */
const TAB_BAR_TOP_PAD = 18;
const TAB_BAR_ROW_HEIGHT = 52;
/**
 * `LiveTabOrb` uses marginTop: -22 and a 92px stack — reserve extra space so FAB/content
 * sit above the protruding orb, not just the flat tab bar background.
 */
const LIVE_ORB_BOTTOM_OVERHANG = 28;

/** Vertical space from bottom safe area through tab bar + Live orb protrusion. */
export function mainTabBarClearance(bottomSafeInset: number): number {
  return TAB_BAR_TOP_PAD + TAB_BAR_ROW_HEIGHT + Math.max(bottomSafeInset, spacing.sm) + LIVE_ORB_BOTTOM_OVERHANG;
}
