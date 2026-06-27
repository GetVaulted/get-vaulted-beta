import type { LiveItemVariantSnapshot, LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';

export type LiveItemSalesFormat = 'auction' | 'buy_now' | 'variant_selection' | 'team_break';

const MAIN_DIVISION_LABELS = new Set([
  'AFC East',
  'AFC North',
  'AFC South',
  'AFC West',
  'NFC East',
  'NFC North',
  'NFC South',
  'NFC West',
].map((label) => label.toLowerCase()));

type VariantDisplayOrderInput = {
  id: string;
  label: string;
  sortOrder?: number;
};

function normalizeLabel(label: string): string {
  return label.trim();
}

function isKnownMainDivisionLabel(label: string): boolean {
  return MAIN_DIVISION_LABELS.has(normalizeLabel(label).toLowerCase());
}

function isSupplementalByLabel(label: string): boolean {
  const t = normalizeLabel(label);
  if (!t) return false;
  if (isKnownMainDivisionLabel(t)) return false;
  if (t.includes(' · ')) return true;
  if (/\bsupp(y|l)?\b/i.test(t)) return true;
  if (/#\d+$/.test(t)) return true;
  return false;
}

function variantSortOrder(variant: VariantDisplayOrderInput): number {
  return typeof variant.sortOrder === 'number' && Number.isFinite(variant.sortOrder)
    ? Math.floor(variant.sortOrder)
    : 0;
}

function maxMainSortOrderAmong(variants: VariantDisplayOrderInput[]): number {
  let max = -1;
  for (const v of variants) {
    if (isKnownMainDivisionLabel(v.label)) {
      max = Math.max(max, variantSortOrder(v));
    }
  }
  if (max >= 0) return max;

  const mainCandidates = variants.filter((v) => !isSupplementalByLabel(v.label));
  if (mainCandidates.length === 0) return -1;
  return Math.max(...mainCandidates.map(variantSortOrder));
}

function isSupplementalVariant(variant: VariantDisplayOrderInput, maxMainSortOrder: number): boolean {
  if (isKnownMainDivisionLabel(variant.label)) return false;
  if (isSupplementalByLabel(variant.label)) return true;
  if (maxMainSortOrder >= 0 && variantSortOrder(variant) > maxMainSortOrder) return true;
  return false;
}

function compareWithinGroup(a: VariantDisplayOrderInput, b: VariantDisplayOrderInput): number {
  const orderDiff = variantSortOrder(a) - variantSortOrder(b);
  if (orderDiff !== 0) return orderDiff;
  const labelDiff = a.label.localeCompare(b.label);
  if (labelDiff !== 0) return labelDiff;
  return a.id.localeCompare(b.id);
}

/** Buyer menus: supplemental spots first, main PYD/division spots second; stable within each group. */
export function sortVariantsForBuyerDisplay<T extends VariantDisplayOrderInput>(variants: T[]): T[] {
  if (variants.length <= 1) return [...variants];
  const maxMain = maxMainSortOrderAmong(variants);
  const indexed = variants.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => {
    const aSupp = isSupplementalVariant(a.v, maxMain);
    const bSupp = isSupplementalVariant(b.v, maxMain);
    if (aSupp !== bSupp) return aSupp ? -1 : 1;
    const cmp = compareWithinGroup(a.v, b.v);
    if (cmp !== 0) return cmp;
    return a.i - b.i;
  });
  return indexed.map(({ v }) => v);
}

export function isVariantSalesFormat(format: string | null | undefined): format is 'variant_selection' | 'team_break' {
  return format === 'variant_selection' || format === 'team_break';
}

export function isActiveVariantBuyerItem(snap: LiveRoomBuyerSnapshot | null | undefined): boolean {
  if (!snap?.activeItemId || snap.status !== 'live') return false;
  if (!isVariantSalesFormat(snap.activeItemSalesFormat)) return false;
  return (snap.activeItemVariants?.length ?? 0) > 0;
}

export function variantIsAvailable(v: LiveItemVariantSnapshot): boolean {
  return v.quantityRemaining > 0 && v.status !== 'sold_out';
}

export function availableVariantCount(variants: LiveItemVariantSnapshot[] | undefined): number {
  return (variants ?? []).filter(variantIsAvailable).length;
}

export function lowestAvailableVariantPrice(variants: LiveItemVariantSnapshot[] | undefined): number | null {
  const prices = (variants ?? []).filter(variantIsAvailable).map((v) => v.priceUsd);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

export type VariantSpotSummary = {
  available: number;
  sold: number;
  spotCount: number;
  fromPriceUsd: number | null;
};

type VariantSpotRow = {
  soldCount?: number;
  quantityRemaining: number;
  status: string;
  priceUsd?: number;
};

export function summarizeVariantSpots(variants: VariantSpotRow[] | undefined | null): VariantSpotSummary {
  if (!variants?.length) {
    return { available: 0, sold: 0, spotCount: 0, fromPriceUsd: null };
  }
  let available = 0;
  let sold = 0;
  const prices: number[] = [];
  for (const v of variants) {
    sold += Math.max(0, v.soldCount ?? 0);
    const soldOut = v.quantityRemaining <= 0 || v.status === 'sold_out';
    if (!soldOut) {
      available += v.quantityRemaining;
      if (typeof v.priceUsd === 'number' && Number.isFinite(v.priceUsd)) prices.push(v.priceUsd);
    }
  }
  return {
    available,
    sold,
    spotCount: variants.length,
    fromPriceUsd: prices.length ? Math.min(...prices) : null,
  };
}

export function isVariantPurchaseItem(
  item: { salesFormat?: string | null; variants?: unknown[] } | null | undefined,
): boolean {
  return Boolean(item && isVariantSalesFormat(item.salesFormat) && (item.variants?.length ?? 0) > 0);
}

export function isRandomVariantAssignment(mode: string | null | undefined): boolean {
  return mode === 'random';
}

/** Host-pinned spot shown to buyers (exclusive `isHot` on an available variant). */
export function hostPinnedBuyerVariant(
  variants: LiveItemVariantSnapshot[] | undefined,
  assignmentMode?: string | null,
): LiveItemVariantSnapshot | null {
  if (!variants?.length || isRandomVariantAssignment(assignmentMode)) return null;
  const pinned = variants.filter((v) => v.isHot && variantIsAvailable(v));
  return pinned[0] ?? null;
}

export function buildExclusiveHostPinUpdates(
  variants: Array<{ id: string }>,
  pinnedVariantId: string,
): Array<{ id: string; isHot: boolean }> {
  return variants.map((v) => ({ id: v.id, isHot: v.id === pinnedVariantId }));
}

/** Buyer CTA on pinned PYT/PYD break — opens the team/division picker sheet. */
export function variantClaimPrimaryLabel(format: LiveItemSalesFormat | null | undefined): string {
  if (format === 'team_break') return 'Claim Division';
  if (format === 'variant_selection') return 'Claim Team';
  return 'Claim Spot';
}

export function pinnedVariantBuyerPrimaryLabel(
  format: LiveItemSalesFormat | null | undefined,
  priceUsd: number,
): string {
  const money = `$${priceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === 'team_break') return `Bid ${money}`;
  return `Place bid ${money}`;
}

export function variantSelectSpotLabel(
  format: LiveItemSalesFormat | null | undefined,
  random = false,
): string {
  if (random) {
    if (format === 'team_break') return 'Random Division';
    if (format === 'variant_selection') return 'Random Team';
  }
  if (format === 'team_break') return 'Pick Your Division';
  if (format === 'variant_selection') return 'Pick Your Team';
  return 'Select Spot';
}
