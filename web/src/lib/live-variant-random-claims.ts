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

/** Load paid random-reveal assignments for PYT/PYD items (team → buyer). */
export async function enrichLiveRoomDetailRandomClaims(detail: LiveRoomDetailDTO): Promise<LiveRoomDetailDTO> {
  const randomItemIds = detail.items
    .filter((i) => isVariantSalesFormat(i.salesFormat) && isRandomVariantAssignment(i.variantAssignmentMode))
    .map((i) => i.id);
  if (randomItemIds.length === 0) return detail;

  const rows = await prisma.liveItemVariantPurchase.findMany({
    where: {
      liveRoomItemId: { in: randomItemIds },
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

  const items = detail.items.map((item) =>
    attachClaimsToItem(item, byItem.get(item.id) ?? []),
  );
  const activeItem = detail.activeItem
    ? attachClaimsToItem(detail.activeItem, byItem.get(detail.activeItem.id) ?? [])
    : null;

  return { ...detail, items, activeItem };
}
