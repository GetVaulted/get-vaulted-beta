export function logVaultEvents(
  channel: 'layout' | 'filter' | 'render',
  data: Record<string, unknown>,
): void {
  if (__DEV__ || process.env.EXPO_PUBLIC_VAULT_EVENTS_DEBUG === '1') {
    console.info(`[vault-events-${channel}]`, JSON.stringify(data));
  }
}
