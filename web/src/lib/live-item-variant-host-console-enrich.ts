import type { LiveItemVariant, LiveRoomItem } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type HostConsoleItemRow = LiveRoomItem & {
  variants?: LiveItemVariant[];
};

type VariantWithLatestPurchase = LiveItemVariant & {
  purchases?: { buyer?: { username: string | null } | null }[];
};

/** Batch-load latest paid buyer per variant (avoids N nested purchase queries in host-console). */
export async function attachHostConsoleVariantPurchases(
  items: HostConsoleItemRow[],
): Promise<(LiveRoomItem & { variants?: VariantWithLatestPurchase[] })[]> {
  const variantIds = items.flatMap((item) => item.variants?.map((v) => v.id) ?? []);
  if (variantIds.length === 0) return items;

  const rows = await prisma.liveItemVariantPurchase.findMany({
    where: { variantId: { in: variantIds }, paymentStatus: "paid" },
    orderBy: { paidAt: "desc" },
    select: {
      variantId: true,
      buyer: { select: { username: true } },
    },
  });

  const latestByVariantId = new Map<string, { buyer?: { username: string | null } | null }>();
  for (const row of rows) {
    if (!latestByVariantId.has(row.variantId)) {
      latestByVariantId.set(row.variantId, { buyer: row.buyer });
    }
  }

  return items.map((item) => ({
    ...item,
    variants: item.variants?.map((variant) => {
      const latest = latestByVariantId.get(variant.id);
      return {
        ...variant,
        purchases: latest ? [latest] : [],
      };
    }),
  }));
}
