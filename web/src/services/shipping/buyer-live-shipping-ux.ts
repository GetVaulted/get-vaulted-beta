import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { LIVE_BUNDLED_SHIPPING_DESTINATION_KEY } from "@/services/shipping/live-shipping-pricing";
import {
  buyerLiveShowShippingHudCopy,
  shippingModeFromRoomFlags,
} from "@/lib/live-show-shipping-terms";
import {
  computeSessionPoolTotals,
  estimateWinItemShippingDeltaCents,
  liveShowShippingConfigFromRoom,
  computePoolTotalsFromGroups,
  resolveLiveRoomItemShippingProfile,
} from "@/services/shipping/live-shipping-pool";

export type BuyerLiveShippingSessionApi = {
  shippingCostCents: number;
  pricingWeightOz: number;
  capReached: boolean;
  nextIncrementalCostCents: number | null;
  tierLabel: string | null;
  /** Show-level buyer shipping cap (cents), when enabled. */
  shippingCapCents: number | null;
  freeShippingEnabled: boolean;
  shippingMode: "calculated" | "capped" | "free";
  showShippingHudCopy: string;
  packageCount: number;
  /** Preview: if buyer wins `previewItemId`, shipping adds this much. */
  previewWinDeltaCents: number | null;
  previewRequiresSeparatePackage: boolean;
};

type Db = Pick<PrismaClient, "liveRoom" | "liveRoomItem" | "liveShippingSession" | "liveShippingSessionItem" | "platformShippingProfile" | "sellerShippingProfile">;

/**
 * Bundled live shipping pool for buyer UX (read-only).
 * Pool total is capped per show — cards stay cheap; a helmet adds a separate package and can bump the total until cap.
 */
export async function getBuyerBundledLiveShippingSessionUx(
  buyerId: string,
  liveShowId: string,
  opts?: { previewLiveRoomItemId?: string | null },
  db: Db = prisma,
): Promise<BuyerLiveShippingSessionApi | null> {
  const room = await db.liveRoom.findUnique({
    where: { id: liveShowId },
    select: {
      id: true,
      sellerId: true,
      roomType: true,
      shippingCapEnabled: true,
      shippingCapCents: true,
      freeShippingEnabled: true,
      sellerPaysOverCap: true,
      shippingMode: true,
    },
  });
  if (!room || !["auction", "break", "sale"].includes(room.roomType)) {
    return null;
  }

  const shippingMode = shippingModeFromRoomFlags(room);
  const showConfig = liveShowShippingConfigFromRoom(room);
  const capCents = shippingMode === "capped" ? room.shippingCapCents : null;
  const hudCopy = buyerLiveShowShippingHudCopy({ mode: shippingMode, capCents: room.shippingCapCents });

  const emptyPayload = (): BuyerLiveShippingSessionApi => ({
    shippingCostCents: 0,
    pricingWeightOz: 0,
    capReached: false,
    nextIncrementalCostCents: null,
    tierLabel: null,
    shippingCapCents: capCents,
    freeShippingEnabled: room.freeShippingEnabled,
    shippingMode,
    showShippingHudCopy: hudCopy,
    packageCount: 0,
    previewWinDeltaCents: null,
    previewRequiresSeparatePackage: false,
  });

  if (room.sellerId === buyerId) {
    return emptyPayload();
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
    select: { id: true },
  });

  let pool = session ? await computeSessionPoolTotals(session.id, db) : null;

  if (!session || !pool || (await db.liveShippingSessionItem.count({ where: { sessionId: session.id } })) === 0) {
    pool = computePoolTotalsFromGroups([], showConfig);
  }

  const previewItemId = opts?.previewLiveRoomItemId?.trim();
  let previewWinDeltaCents: number | null = null;
  let previewRequiresSeparatePackage = false;

  if (previewItemId) {
    try {
      previewWinDeltaCents = await estimateWinItemShippingDeltaCents({
        buyerId,
        liveShowId,
        liveRoomItemId: previewItemId,
        db,
      });
      const prof = await resolveLiveRoomItemShippingProfile(previewItemId, db);
      previewRequiresSeparatePackage = prof?.resolved.requiresSeparatePackage === true;
    } catch (e) {
      console.error("[buyer-live-shipping-ux] preview delta failed", {
        liveShowId,
        previewItemId,
        e,
      });
      previewWinDeltaCents = null;
    }
  } else if (!pool.capReached && session) {
    const lastItem = await db.liveShippingSessionItem.findFirst({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      select: { listingId: true },
    });
    if (lastItem) {
      const liveItem = await db.liveRoomItem.findFirst({
        where: { liveRoomId: room.id, listingId: lastItem.listingId },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (liveItem) {
        previewWinDeltaCents = await estimateWinItemShippingDeltaCents({
          buyerId,
          liveShowId,
          liveRoomItemId: liveItem.id,
          db,
        });
      }
    }
  }

  const packageLabel =
    pool.packageCount <= 1
      ? "1 package"
      : `${pool.packageCount} packages`;

  return {
    shippingCostCents: pool.buyerTotalCents,
    pricingWeightOz: pool.pricingWeightOz,
    capReached: pool.capReached,
    nextIncrementalCostCents: previewWinDeltaCents,
    tierLabel: packageLabel,
    shippingCapCents: capCents,
    freeShippingEnabled: room.freeShippingEnabled,
    shippingMode,
    showShippingHudCopy: hudCopy,
    packageCount: pool.packageCount,
    previewWinDeltaCents,
    previewRequiresSeparatePackage,
  };
}
