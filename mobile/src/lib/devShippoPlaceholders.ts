/**
 * Dev-only placeholder return addresses so Stripe → Shippo webhook can run end-to-end.
 * Disable in production builds that collect real addresses from users.
 */
export function devPlaceholderShipFrom(
  senderId: string,
  recipientId: string,
): Record<string, Record<string, string>> {
  return {
    [senderId]: {
      name: 'Sender · Dev placeholder',
      street1: '123 Market St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94103',
      country: 'US',
    },
    [recipientId]: {
      name: 'Recipient · Dev placeholder',
      street1: '456 Vault Ave',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'US',
    },
  };
}

export function shouldAttachDevShipFrom(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_TRADE_DEV_PLACEHOLDER_SHIP_FROM === '1';
}
