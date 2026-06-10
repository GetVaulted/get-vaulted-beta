import {
  buildVaultEcosystemEvent,
  emitVaultEcosystemEventToParties,
  type VaultEcosystemEventType,
} from "@/lib/vault-ecosystem-realtime";

export type MarketplaceSyncParties = {
  sellerId: string;
  buyerId: string;
};

export type MarketplaceSyncEntities = {
  listingId?: string;
  layawayId?: string;
  orderId?: string;
};

type SyncPayload = Record<string, unknown> & {
  listingId?: string;
  layawayId?: string;
  orderId?: string;
  sellerId: string;
  buyerId: string;
  status: string;
};

function buildSyncPayload(
  parties: MarketplaceSyncParties,
  entities: MarketplaceSyncEntities,
  status: string,
  extra?: Record<string, unknown>,
): SyncPayload {
  return {
    sellerId: parties.sellerId,
    buyerId: parties.buyerId,
    status,
    ...(entities.listingId ? { listingId: entities.listingId } : {}),
    ...(entities.layawayId ? { layawayId: entities.layawayId } : {}),
    ...(entities.orderId ? { orderId: entities.orderId } : {}),
    ...extra,
  };
}

function emitToParties(
  type: VaultEcosystemEventType,
  entityId: string,
  parties: MarketplaceSyncParties,
  payload: SyncPayload,
): void {
  emitVaultEcosystemEventToParties(
    buildVaultEcosystemEvent({
      type,
      entityId,
      sellerId: parties.sellerId,
      buyerId: parties.buyerId,
      payload,
    }),
    parties,
  );
}

/** Emit typed lifecycle event plus canonical `*_status_changed` fan-out. */
export function emitMarketplaceStateSync(args: {
  typedEvent: VaultEcosystemEventType;
  entityId: string;
  parties: MarketplaceSyncParties;
  entities: MarketplaceSyncEntities;
  status: string;
  extraPayload?: Record<string, unknown>;
}): void {
  const payload = buildSyncPayload(args.parties, args.entities, args.status, args.extraPayload);
  emitToParties(args.typedEvent, args.entityId, args.parties, payload);

  if (args.entities.layawayId) {
    emitToParties("layaway_status_changed", args.entities.layawayId, args.parties, payload);
  }
  if (args.entities.orderId) {
    emitToParties("order_status_changed", args.entities.orderId, args.parties, payload);
  }
  if (args.entities.listingId) {
    emitToParties("listing_status_changed", args.entities.listingId, args.parties, payload);
  }
}

export function emitLayawayLifecycleSync(args: {
  typedEvent: VaultEcosystemEventType;
  layawayId: string;
  parties: MarketplaceSyncParties;
  listingId: string;
  orderId: string;
  layawayStatus: string;
  listingStatus?: string;
  orderStatus?: string;
  paymentStatus?: string;
  extraPayload?: Record<string, unknown>;
}): void {
  emitMarketplaceStateSync({
    typedEvent: args.typedEvent,
    entityId: args.layawayId,
    parties: args.parties,
    entities: {
      layawayId: args.layawayId,
      listingId: args.listingId,
      orderId: args.orderId,
    },
    status: args.layawayStatus,
    extraPayload: {
      ...(args.listingStatus ? { listingStatus: args.listingStatus } : {}),
      ...(args.orderStatus ? { orderStatus: args.orderStatus } : {}),
      ...(args.paymentStatus ? { paymentStatus: args.paymentStatus } : {}),
      ...args.extraPayload,
    },
  });
}

export function emitOrderLifecycleSync(args: {
  orderId: string;
  parties: MarketplaceSyncParties;
  listingId: string;
  layawayId?: string;
  orderStatus: string;
  paymentStatus: string;
  listingStatus?: string;
  extraPayload?: Record<string, unknown>;
}): void {
  emitMarketplaceStateSync({
    typedEvent: "order_updated",
    entityId: args.orderId,
    parties: args.parties,
    entities: {
      orderId: args.orderId,
      listingId: args.listingId,
      layawayId: args.layawayId,
    },
    status: args.paymentStatus,
    extraPayload: {
      orderStatus: args.orderStatus,
      paymentStatus: args.paymentStatus,
      ...(args.listingStatus ? { listingStatus: args.listingStatus } : {}),
      ...args.extraPayload,
    },
  });
}
