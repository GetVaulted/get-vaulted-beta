import { isRandomVariantAssignment, isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import type { RandomSpotClaim } from "@/lib/live-variant-spot-board";
import type { LiveRoomDetailDTO, LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { prisma } from "@/lib/prisma";

function attachClaimsToItem(item: LiveRoomItemDTO, claims: RandomSpotClaim[]): LiveRoomItemDTO {
  if (!isVariantSalesFormat(item.salesFormat) || !isRandomVariantAssignment(item.variantAssignmentMode)) {
    return item;
  }
  return { ...item, randomSpotClaims: claims };
}

async function loadRandomSpotClaimsByItemId(itemIds: string[]): Promise<Map<string, RandomSpotClaim[]>> {
  if (itemIds.length === 0) return new Map();

  const rows = await prisma.liveItemVariantPurchase.findMany({
    where: {
      liveRoomItemId: { in: itemIds },
      paymentStatus: "paid",
      revealedLabel: { not: null },
    },
    select: {
      liveRoomItemId: true,
      revealedLabel: true,
      buyer: { select: { username: true } },
    },
  });

  const byItem = new Map<string, RandomSpotClaim[]>();
  for (const row of rows) {
    const label = row.revealedLabel?.trim();
    const buyerUsername = row.buyer?.username?.trim();
    if (!label || !buyerUsername) continue;
    const list = byItem.get(row.liveRoomItemId) ?? [];
    list.push({ label, buyerUsername });
    byItem.set(row.liveRoomItemId, list);
  }
  return byItem;
}

/** Attach paid random-reveal assignments (team/division label → buyer) to queue items. */
export async function enrichLiveRoomItemsRandomClaims(items: LiveRoomItemDTO[]): Promise<LiveRoomItemDTO[]> {
  const randomItemIds = items
    .filter((i) => isVariantSalesFormat(i.salesFormat) && isRandomVariantAssignment(i.variantAssignmentMode))
    .map((i) => i.id);
  if (randomItemIds.length === 0) return items;

  const byItem = await loadRandomSpotClaimsByItemId(randomItemIds);
  return items.map((item) => attachClaimsToItem(item, byItem.get(item.id) ?? []));
}

/** Load paid random-reveal assignments for PYT/PYD items (team → buyer). */
export async function enrichLiveRoomDetailRandomClaims(detail: LiveRoomDetailDTO): Promise<LiveRoomDetailDTO> {
  const items = await enrichLiveRoomItemsRandomClaims(detail.items);
  const activeItem = detail.activeItem ? items.find((i) => i.id === detail.activeItem!.id) ?? detail.activeItem : null;
  return { ...detail, items, activeItem };
}
