import { NFL_DIVISIONS, NFL_TEAMS, liveBreakVariantIsSold, spotColorKeyForPoolLabel } from './liveBreakPresets';
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
  const salesFormat = item.salesFormat;

  if (isRandomVariantAssignment(item.variantAssignmentMode)) {
    const pool =
      salesFormat === 'team_break'
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
        color: spotColorKeyForPoolLabel(label, salesFormat),
      };
    });
  }

  return item.variants.map((v) => {
    const sold = liveBreakVariantIsSold(v);
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

export type VariantSpotBoardSummary = {
  rows: VariantSpotDisplayRow[];
  openCount: number;
  soldCount: number;
};

/**
 * Same rows as `buildVariantSpotDisplayRows`, plus a host-facing open/sold summary.
 *
 * For random PYT/PYD pools, per-label "sold" flags come from `randomSpotClaims`, a realtime
 * claim feed that can lag behind actual paid purchases. The numeric summary instead reconciles
 * with the pool variant's server-authoritative `quantityRemaining` when available, so the host
 * never sees an "X open" count that disagrees with confirmed inventory. `randomSpotClaims`
 * remains the (secondary, display-only) source for which SPECIFIC labels show as taken.
 */
export function summarizeVariantSpotBoard(
  item: Pick<LiveRoomItemRow, 'salesFormat' | 'variantAssignmentMode' | 'variants'> & {
    randomSpotClaims?: RandomSpotClaim[];
  },
): VariantSpotBoardSummary {
  const rows = buildVariantSpotDisplayRows(item);
  if (rows.length === 0) return { rows, openCount: 0, soldCount: 0 };

  if (isRandomVariantAssignment(item.variantAssignmentMode)) {
    const poolVariant = item.variants?.[0];
    const authoritativeRemaining = poolVariant?.quantityRemaining;
    if (typeof authoritativeRemaining === 'number' && Number.isFinite(authoritativeRemaining)) {
      const openCount = Math.max(0, Math.min(rows.length, authoritativeRemaining));
      return { rows, openCount, soldCount: rows.length - openCount };
    }
  }

  const soldCount = rows.filter((r) => r.sold).length;
  return { rows, openCount: rows.length - soldCount, soldCount };
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
