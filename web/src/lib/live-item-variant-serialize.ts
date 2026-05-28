import type {
  LiveItemSalesFormat,
  LiveItemVariant,
  LiveItemVariantPurchase,
  LiveItemVariantStatus,
  User,
} from "@/generated/prisma/client";

export type LiveItemVariantDTO = {
  id: string;
  liveRoomItemId: string;
  label: string;
  priceUsd: number;
  quantityInitial: number;
  quantityRemaining: number;
  soldCount: number;
  isHot: boolean;
  imageUrl: string;
  color: string;
  sortOrder: number;
  status: LiveItemVariantStatus;
  buyerUsername: string | null;
};

type VariantRow = LiveItemVariant & {
  purchases?: { buyer?: Pick<User, "username"> | null }[];
};

export function serializeLiveItemVariant(row: VariantRow): LiveItemVariantDTO {
  const paid = row.purchases?.[0];
  return {
    id: row.id,
    liveRoomItemId: row.liveRoomItemId,
    label: row.label,
    priceUsd: row.priceUsd,
    quantityInitial: row.quantityInitial,
    quantityRemaining: row.quantityRemaining,
    soldCount: row.soldCount,
    isHot: row.isHot,
    imageUrl: row.imageUrl,
    color: row.color,
    sortOrder: row.sortOrder,
    status: row.status,
    buyerUsername: paid?.buyer?.username?.trim() ?? null,
  };
}

export function serializeLiveItemVariants(rows: VariantRow[] | undefined | null): LiveItemVariantDTO[] {
  if (!rows?.length) return [];
  return rows.map(serializeLiveItemVariant);
}

export function parseLiveItemSalesFormat(raw: unknown): LiveItemSalesFormat {
  if (raw === "buy_now" || raw === "variant_selection" || raw === "team_break" || raw === "auction") {
    return raw;
  }
  return "auction";
}
