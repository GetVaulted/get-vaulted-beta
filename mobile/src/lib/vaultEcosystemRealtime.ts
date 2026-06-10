/** Canonical vault ecosystem events — must match web/src/lib/vault-ecosystem-realtime.ts */

export const VAULT_ECOSYSTEM_RT_EVENT = 'vault_ecosystem' as const;

export function vaultEcosystemChannel(userId: string): string {
  return `gv-ecosystem-${userId}`;
}

export const VAULT_ECOSYSTEM_EVENT_TYPES = [
  'layaway_started',
  'layaway_payment_made',
  'layaway_paid_in_full',
  'layaway_canceled',
  'layaway_defaulted',
  'listing_reserved_on_layaway',
  'order_created_from_layaway',
  'listing_status_changed',
  'order_updated',
  'offer_updated',
  'trade_offer_updated',
  'notification_created',
] as const;

export type VaultEcosystemEventType = (typeof VAULT_ECOSYSTEM_EVENT_TYPES)[number];

export type VaultEcosystemEvent = {
  type: VaultEcosystemEventType;
  entityId: string;
  sellerId?: string | null;
  buyerId?: string | null;
  timestamp: string;
  payload?: Record<string, unknown>;
};

export function parseVaultEcosystemEvent(raw: unknown): VaultEcosystemEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== 'string' || typeof o.entityId !== 'string' || typeof o.timestamp !== 'string') return null;
  return o as VaultEcosystemEvent;
}

export function isLayawayEcosystemEvent(type: VaultEcosystemEventType): boolean {
  return (
    type.startsWith('layaway_') ||
    type === 'listing_reserved_on_layaway' ||
    type === 'order_created_from_layaway'
  );
}

export function isOrderEcosystemEvent(type: VaultEcosystemEventType): boolean {
  return type === 'order_created_from_layaway' || type === 'order_updated';
}

export function isListingEcosystemEvent(type: VaultEcosystemEventType): boolean {
  return type === 'listing_reserved_on_layaway' || type === 'listing_status_changed';
}
