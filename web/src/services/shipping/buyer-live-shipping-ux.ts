import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeBundledNextItemShippingDeltaCents,
  LIVE_BUNDLED_SHIPPING_DESTINATION_KEY,
  liveShippingTierLabelForPricingWeightOz,
} from "@/services/shipping/live-shipping-pricing";

export type BuyerLiveShippingSessionApi = {
  shippingCostCents: number;
  pricingWeightOz: number;
  capReached: boolean;
  nextIncrementalCostCents: number | null;
  tierLabel: string | null;
};

type Db = Pick<PrismaClient, "liveRoom" | "liveShippingSession" | "liveShippingSessionItem">;

/**
 * Read-only bundled live shipping snapshot for buyer UX (does not create sessions or change pricing).
 */
export async function getBuyerBundledLiveShippingSessionUx(
  buyerId: string,
  liveShowId: string,
  db: Db = prisma,
): Promise<BuyerLiveShippingSessionApi | null> {
  const room = await db.liveRoom.findUnique({
    where: { id: liveShowId },
    select: { id: true, sellerId: true, roomType: true },
  });
  if (!room || (room.roomType !== "auction" && room.roomType !== "sale")) {
    return null;
  }
  if (room.sellerId === buyerId) {
    return {
      shippingCostCents: 0,
      pricingWeightOz: 0,
      capReached: false,
      nextIncrementalCostCents: null,
      tierLabel: null,
    };
  }

  const session = await db.liveShippingSession.findUnique({
    where: {
      buyerId_sellerId_liveShowId_destinationAddressId: {
        buyerId,
        sellerId: room.sellerId,
        liveShowId: room.id,
        destinationAddressId: LIVE_BUNDLED_SHIPPING_DESTINATION_KEY,
      },
    },
    select: {
      id: true,
      pricingWeightOz: true,
      shippingCostCents: true,
      capReached: true,
    },
  });

  if (!session) {
    return {
      shippingCostCents: 0,
      pricingWeightOz: 0,
      capReached: false,
      nextIncrementalCostCents: null,
      tierLabel: null,
    };
  }

  const itemCount = await db.liveShippingSessionItem.count({
    where: { sessionId: session.id },
  });

  if (itemCount === 0) {
    return {
      shippingCostCents: 0,
      pricingWeightOz: 0,
      capReached: false,
      nextIncrementalCostCents: null,
      tierLabel: null,
    };
  }

  const lastItem = await db.liveShippingSessionItem.findFirst({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    select: {
      incrementalWeightOz: true,
      listing: {
        select: { shippingIncrementalWeightOz: true, shippingPriceCapCents: true },
      },
    },
  });

  const inc =
    lastItem && Number.isFinite(lastItem.incrementalWeightOz) && lastItem.incrementalWeightOz > 0
      ? lastItem.incrementalWeightOz
      : lastItem?.listing?.shippingIncrementalWeightOz ?? 0;

  const listingCap = lastItem?.listing?.shippingPriceCapCents ?? null;

  const nextIncrementalCostCents =
    itemCount > 0 && Number.isFinite(inc) && inc > 0
      ? computeBundledNextItemShippingDeltaCents({
          currentPricingWeightOz: session.pricingWeightOz,
          currentShippingCostCents: session.shippingCostCents,
          capReached: session.capReached,
          incrementalWeightOz: inc,
          listingCapCents: listingCap,
        })
      : null;

  return {
    shippingCostCents: session.shippingCostCents,
    pricingWeightOz: session.pricingWeightOz,
    capReached: session.capReached,
    nextIncrementalCostCents,
    tierLabel: liveShippingTierLabelForPricingWeightOz(session.pricingWeightOz),
  };
}
