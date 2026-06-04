import { spacing } from '../theme';

/** Measured FAB row height (padding + label). */
export const VAULT_EVENTS_FAB_HEIGHT = 52;
export const VAULT_EVENTS_FAB_GAP = 12;

export type VaultEventsLayoutMetrics = {
  fabBottom: number;
  contentPaddingBottom: number;
};

export function vaultEventsFabMetrics(mainTabBarClearance: number): VaultEventsLayoutMetrics {
  const fabBottom = mainTabBarClearance + VAULT_EVENTS_FAB_GAP;
  const contentPaddingBottom = fabBottom + VAULT_EVENTS_FAB_HEIGHT + spacing.md;
  return { fabBottom, contentPaddingBottom };
}

export function logVaultEvents(
  channel: 'layout' | 'filter' | 'render',
  data: Record<string, unknown>,
): void {
  if (__DEV__ || process.env.EXPO_PUBLIC_VAULT_EVENTS_DEBUG === '1') {
    console.info(`[vault-events-${channel}]`, JSON.stringify(data));
  }
}
