import {
  isRandomVariantAssignment,
  isVariantSalesFormat,
  NFL_DIVISIONS_PRESET,
  NFL_TEAMS_PRESET,
} from "@/lib/live-item-variant-presets";
import type { LiveItemVariantDTO, LiveRoomItemDTO } from "@/lib/live-room-serialize";

export type RandomSpotClaim = { label: string; buyerUsername: string };

export type VariantSpotDisplayRow = {
  id: string;
  label: string;
  priceUsd: number;
  sold: boolean;
  /** Host retired the team — still on the board, not for sale (not a sale). */
  unavailable: boolean;
  buyerUsername: string | null;
  isHot: boolean;
  variantId?: string;
};

export function formatSoldSpotBuyerLabel(buyerUsername: string | null | undefined): string {
  const username = buyerUsername?.trim().replace(/^@+/, "");
  return username ? `@${username}` : "Sold";
}

export function formatUnavailableSpotLabel(): string {
  return "Unavailable";
}

export function buildVariantSpotDisplayRows(
  item: Pick<LiveRoomItemDTO, "salesFormat" | "variantAssignmentMode" | "variants">,
  randomSpotClaims: RandomSpotClaim[] = [],
): VariantSpotDisplayRow[] {
  if (!isVariantSalesFormat(item.salesFormat) || !item.variants?.length) return [];

  if (isRandomVariantAssignment(item.variantAssignmentMode)) {
    const pool =
      item.salesFormat === "team_break"
        ? NFL_DIVISIONS_PRESET.map((d) => d.label)
        : NFL_TEAMS_PRESET.map((t) => t.label);
    const claimByLabel = new Map(
      randomSpotClaims.map((c) => [c.label.trim().toLowerCase(), c.buyerUsername.replace(/^@+/, "")]),
    );
    const poolVariant = item.variants[0];
    const price = poolVariant?.priceUsd ?? 0;
    return pool.map((label) => {
      const buyer = claimByLabel.get(label.toLowerCase()) ?? null;
      return {
        id: `random-${label}`,
        label,
        priceUsd: price,
        sold: buyer != null,
        unavailable: false,
        buyerUsername: buyer,
        isHot: false,
      };
    });
  }

  return item.variants.map((v) => rowFromVariant(v));
}

function rowFromVariant(v: LiveItemVariantDTO): VariantSpotDisplayRow {
  const unavailable = v.status === "removed";
  const sold = !unavailable && (v.quantityRemaining <= 0 || v.status === "sold_out");
  return {
    id: v.id,
    label: v.label,
    priceUsd: v.priceUsd,
    sold,
    unavailable,
    buyerUsername: sold ? v.buyerUsername?.trim()?.replace(/^@+/, "") ?? null : null,
    isHot: !unavailable && v.isHot,
    variantId: v.id,
  };
}
