import { NFL_DIVISIONS_PRESET } from "@/lib/live-item-variant-presets";

const MAIN_DIVISION_LABELS = new Set(NFL_DIVISIONS_PRESET.map((d) => d.label.toLowerCase()));

export type VariantDisplayOrderInput = {
  id: string;
  label: string;
  sortOrder?: number;
};

function normalizeLabel(label: string): string {
  return label.trim();
}

export function isKnownMainDivisionLabel(label: string): boolean {
  return MAIN_DIVISION_LABELS.has(normalizeLabel(label).toLowerCase());
}

function isSupplementalByLabel(label: string): boolean {
  const t = normalizeLabel(label);
  if (!t) return false;
  if (isKnownMainDivisionLabel(t)) return false;
  if (t.includes(" · ")) return true;
  if (/\bsupp(y|l)?\b/i.test(t)) return true;
  if (/#\d+$/.test(t)) return true;
  return false;
}

function variantSortOrder(variant: VariantDisplayOrderInput): number {
  return typeof variant.sortOrder === "number" && Number.isFinite(variant.sortOrder)
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
