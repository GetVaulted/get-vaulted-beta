import { RT_EVENT, vaultEcosystemChannel } from "@/lib/realtime-channels";
import { broadcastRealtimeEvent } from "@/lib/supabase-realtime-broadcast";

/** Canonical cross-client vault ecosystem events (web + mobile). */
export const VAULT_ECOSYSTEM_EVENT_TYPES = [
  "layaway_started",
  "layaway_payment_made",
  "layaway_paid_in_full",
  "layaway_canceled",
  "layaway_defaulted",
  "listing_reserved_on_layaway",
  "order_created_from_layaway",
  "listing_status_changed",
  "order_updated",
  "offer_updated",
  "trade_offer_updated",
  "notification_created",
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

export function buildVaultEcosystemEvent(input: {
  type: VaultEcosystemEventType;
  entityId: string;
  sellerId?: string | null;
  buyerId?: string | null;
  payload?: Record<string, unknown>;
  timestamp?: string;
}): VaultEcosystemEvent {
  return {
    type: input.type,
    entityId: input.entityId,
    sellerId: input.sellerId ?? null,
    buyerId: input.buyerId ?? null,
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(input.payload && Object.keys(input.payload).length > 0 ? { payload: input.payload } : {}),
  };
}

export function emitVaultEcosystemEventToUser(userId: string, event: VaultEcosystemEvent): void {
  if (!userId.trim()) return;
  broadcastRealtimeEvent(vaultEcosystemChannel(userId), RT_EVENT.vaultEcosystem, event as unknown as Record<string, unknown>);
}

/** Fan-out to seller and buyer (deduped). */
export function emitVaultEcosystemEventToParties(
  event: VaultEcosystemEvent,
  parties: { sellerId?: string | null; buyerId?: string | null },
): void {
  const ids = new Set<string>();
  if (parties.sellerId?.trim()) ids.add(parties.sellerId.trim());
  if (parties.buyerId?.trim()) ids.add(parties.buyerId.trim());
  for (const userId of ids) emitVaultEcosystemEventToUser(userId, event);
}

export function isLayawayEcosystemEventType(type: VaultEcosystemEventType): boolean {
  return (
    type.startsWith("layaway_") ||
    type === "listing_reserved_on_layaway" ||
    type === "order_created_from_layaway"
  );
}

export function isOrderEcosystemEventType(type: VaultEcosystemEventType): boolean {
  return type === "order_created_from_layaway" || type === "order_updated";
}

export function isListingEcosystemEventType(type: VaultEcosystemEventType): boolean {
  return type === "listing_reserved_on_layaway" || type === "listing_status_changed";
}
