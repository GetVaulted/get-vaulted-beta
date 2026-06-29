import { prisma } from "@/lib/prisma";

/** Marketplace order ids created for PYT/PYD spots and break claims during a live show. */
export async function liveShowFulfillmentOrderIds(liveShowId: string): Promise<string[]> {
  const [variants, spots] = await Promise.all([
    prisma.liveItemVariantPurchase.findMany({
      where: { liveRoomId: liveShowId, fulfillmentOrderId: { not: null } },
      select: { fulfillmentOrderId: true },
    }),
    prisma.breakSpot.findMany({
      where: { liveRoomId: liveShowId, fulfillmentOrderId: { not: null } },
      select: { fulfillmentOrderId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const row of [...variants, ...spots]) {
    const id = row.fulfillmentOrderId?.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}
