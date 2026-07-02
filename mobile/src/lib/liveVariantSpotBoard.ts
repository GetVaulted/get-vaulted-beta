import { NFL_DIVISIONS, NFL_TEAMS, spotColorKeyForPoolLabel } from './liveBreakPresets';
import { isRandomVariantAssignment, isVariantSalesFormat } from './liveItemVariant';
import type { LiveRoomItemRow } from '../api/liveRoomControlRepository';

export type RandomSpotClaim = { label: string; buyerUsername: string };

export type VariantSpotDisplayRow = {
  id: string;
  label: string;
  priceUsd: number;
  sold: boolean;
  buyerUsername: string | null;
  isHot: boolean;
  variantId?: string;
  color?: string | null;
};

export function formatSoldSpotBuyerLabel(buyerUsername: string | null | undefined): string {
  const username = buyerUsername?.trim().replace(/^@+/, '');
  return username ? `@${username}` : 'Sold';
}

export function buildVariantSpotDisplayRows(
  item: Pick<LiveRoomItemRow, 'salesFormat' | 'variantAssignmentMode' | 'variants'> & {
    randomSpotClaims?: RandomSpotClaim[];
  },
): VariantSpotDisplayRow[] {
  if (!item.salesFormat || !isVariantSalesFormat(item.salesFormat) || !item.variants?.length) return [];

  if (isRandomVariantAssignment(item.variantAssignmentMode)) {
    const pool =
      item.salesFormat === 'team_break'
        ? NFL_DIVISIONS.map((d) => d.label)
        : NFL_TEAMS.map((t) => t.name);
    const claimByLabel = new Map(
      (item.randomSpotClaims ?? []).map((c) => [
        c.label.trim().toLowerCase(),
        c.buyerUsername.replace(/^@+/, ''),
      ]),
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
        buyerUsername: buyer,
        isHot: false,
        color: spotColorKeyForPoolLabel(label, item.salesFormat),
      };
    });
  }

  return item.variants.map((v) => {
    const sold = v.quantityRemaining <= 0 || v.status === 'sold_out';
    return {
      id: v.id,
      label: v.label,
      priceUsd: v.priceUsd,
      sold,
      buyerUsername: sold ? v.buyerUsername?.trim()?.replace(/^@+/, '') ?? null : null,
      isHot: v.isHot,
      variantId: v.id,
      color: v.color ?? null,
    };
  });
}

/** Merge a live random-reveal assignment into host item state (no server deploy required). */
export function mergeRandomSpotClaimIntoItem(
  item: LiveRoomItemRow,
  claim: RandomSpotClaim,
): LiveRoomItemRow {
  const label = claim.label.trim();
  const buyerUsername = claim.buyerUsername.trim().replace(/^@+/, '');
  if (!label || !buyerUsername) return item;
  const existing = item.randomSpotClaims ?? [];
  const key = label.toLowerCase();
  if (existing.some((c) => c.label.trim().toLowerCase() === key)) return item;
  return { ...item, randomSpotClaims: [...existing, { label, buyerUsername }] };
}

export function parseVariantPurchasedRandomClaim(payload: unknown): {
  itemId: string;
  claim: RandomSpotClaim;
} | null {
  if (!payload || typeof payload !== 'object') return null;
  const o = payload as Record<string, unknown>;
  const itemId = typeof o.itemId === 'string' ? o.itemId.trim() : '';
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  const buyerUsername =
    typeof o.buyerUsername === 'string' ? o.buyerUsername.trim().replace(/^@+/, '') : '';
  if (!itemId || !label || !buyerUsername) return null;
  return { itemId, claim: { label, buyerUsername } };
}
