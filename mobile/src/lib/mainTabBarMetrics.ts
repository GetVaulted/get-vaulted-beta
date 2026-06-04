import { spacing } from '../theme';

/** Vertical space reserved above home-indicator for the main app tab bar + Live orb. */
export function mainTabBarClearance(bottomSafeInset: number): number {
  return 18 + 52 + Math.max(bottomSafeInset, spacing.sm);
}
