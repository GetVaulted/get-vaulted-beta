import { Prisma } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";

/** Default TTL for checkout / win-intent reservations (ms). */
export const LIVE_AUCTION_INVENTORY_HOLD_TTL_MS = 20 * 60 * 1000;

/**
 * Reserves inventory for a **listing-backed** sellable unit (one active hold per listing at DB level).
 * Same buyer refreshes expiry; different buyer throws `LISTING_INVENTORY_HELD`.
 */
export async function reserveListingInventoryHoldTx(
  tx: TransactionClient,
  args: {
    listingId: string;
    userId: string;
    source: string;
    liveRoomItemId?: string | null;
    ttlMs?: number;
  },
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (args.ttlMs ?? LIVE_AUCTION_INVENTORY_HOLD_TTL_MS));
  const existing = await tx.liveAuctionInventoryHold.findFirst({
    where: { listingId: args.listingId, status: "active" },
  });
  if (existing) {
    // A hold whose TTL has passed must never keep blocking other buyers just because the
    // periodic expiry sweep (`expireStaleLiveAuctionInventoryHolds`) hasn't run yet or was
    // skipped — an abandoned checkout would otherwise make the listing unsellable forever.
    if (existing.expiresAt.getTime() <= now.getTime()) {
      await tx.liveAuctionInventoryHold.update({
        where: { id: existing.id },
        data: { status: "expired", releasedAt: now },
      });
    } else if (existing.userId !== args.userId) {
      throw Object.assign(new Error("LISTING_INVENTORY_HELD"), { code: "LISTING_INVENTORY_HELD" });
    } else {
      await tx.liveAuctionInventoryHold.update({
        where: { id: existing.id },
        data: {
          expiresAt,
          source: args.source,
          liveRoomItemId: args.liveRoomItemId ?? null,
        },
      });
      return;
    }
  }
  try {
    await tx.liveAuctionInventoryHold.create({
      data: {
        listingId: args.listingId,
        liveRoomItemId: args.liveRoomItemId ?? null,
        userId: args.userId,
        status: "active",
        source: args.source,
        units: 1,
        expiresAt,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const race = await tx.liveAuctionInventoryHold.findFirst({
        where: { listingId: args.listingId, status: "active" },
      });
      if (race && race.userId !== args.userId) {
        throw Object.assign(new Error("LISTING_INVENTORY_HELD"), { code: "LISTING_INVENTORY_HELD" });
      }
      return;
    }
    throw e;
  }
}

/** Host-only queue row (`listingId` null): one active hold per `liveRoomItemId`. */
export async function reserveHostLiveItemInventoryHoldTx(
  tx: TransactionClient,
  args: { liveRoomItemId: string; userId: string; source: string; ttlMs?: number },
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (args.ttlMs ?? LIVE_AUCTION_INVENTORY_HOLD_TTL_MS));
  const existing = await tx.liveAuctionInventoryHold.findFirst({
    where: { listingId: null, liveRoomItemId: args.liveRoomItemId, status: "active" },
  });
  if (existing) {
    if (existing.expiresAt.getTime() <= now.getTime()) {
      await tx.liveAuctionInventoryHold.update({
        where: { id: existing.id },
        data: { status: "expired", releasedAt: now },
      });
    } else if (existing.userId !== args.userId) {
      throw new Error("LIVE_ITEM_INVENTORY_HELD");
    } else {
      await tx.liveAuctionInventoryHold.update({
        where: { id: existing.id },
        data: { expiresAt, source: args.source },
      });
      return;
    }
  }
  try {
    await tx.liveAuctionInventoryHold.create({
      data: {
        listingId: null,
        liveRoomItemId: args.liveRoomItemId,
        userId: args.userId,
        status: "active",
        source: args.source,
        units: 1,
        expiresAt,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const race = await tx.liveAuctionInventoryHold.findFirst({
        where: { listingId: null, liveRoomItemId: args.liveRoomItemId, status: "active" },
      });
      if (race && race.userId !== args.userId) throw new Error("LIVE_ITEM_INVENTORY_HELD");
      return;
    }
    throw e;
  }
}

export async function consumeListingInventoryHoldTx(
  tx: TransactionClient,
  args: { listingId: string; userId: string; orderId: string },
): Promise<void> {
  await tx.liveAuctionInventoryHold.updateMany({
    where: { listingId: args.listingId, userId: args.userId, status: "active" },
    data: { status: "consumed", consumedAt: new Date(), orderId: args.orderId },
  });
}

export async function releaseActiveInventoryHoldsForListingAndBuyerTx(
  tx: TransactionClient,
  args: { listingId: string; userId: string },
): Promise<void> {
  await tx.liveAuctionInventoryHold.updateMany({
    where: { listingId: args.listingId, userId: args.userId, status: "active" },
    data: { status: "released", releasedAt: new Date() },
  });
}

export async function releaseActiveInventoryHoldsForOrderId(orderId: string): Promise<void> {
  const ord = await prisma.order.findUnique({
    where: { id: orderId },
    select: { listingId: true, buyerId: true },
  });
  if (!ord) return;
  await prisma.$transaction(async (tx) => {
    await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, { listingId: ord.listingId, userId: ord.buyerId });
  });
}

/** Marks expired active holds (cron / manual). */
export async function expireStaleLiveAuctionInventoryHolds(now = new Date()): Promise<number> {
  const r = await prisma.liveAuctionInventoryHold.updateMany({
    where: { status: "active", expiresAt: { lt: now } },
    data: { status: "expired", releasedAt: now },
  });
  return r.count;
}

/** Stripe Checkout `metadata` on buy-now sessions includes `listingId` + `buyerId`. */
export async function releaseActiveInventoryHoldFromBuyNowStripeMetadata(metadata: {
  listingId?: string | null;
  buyerId?: string | null;
}): Promise<void> {
  const listingId = metadata.listingId?.trim();
  const buyerId = metadata.buyerId?.trim();
  if (!listingId || !buyerId) return;
  await prisma.$transaction(async (tx) => {
    await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, { listingId, userId: buyerId });
  });
}
