/**
 * Surprise Sets — a sealed pool of items sold as identical-priced "units". The buyer pays one
 * price, the server draws one unit from what is left, and the reveal wheel shows the result.
 *
 * Built on the Random Player pool (`customRandomPoolLabels`): every physical unit becomes one
 * unique pool label, so the existing draw / unique-claim / reveal pipeline is reused unchanged.
 * This file is shared by web and mobile — keep it dependency-free.
 */

/**
 * Hard cap on units in one set (TikTok-style pools run to 500). Each unit is one pool label, so the
 * random-pool label cap is raised to this for Surprise Sets only — player breaks stay at PLAYER_SPOT_MAX.
 */
export const SURPRISE_SET_MAX_UNITS = 500;
export const SURPRISE_SET_MIN_UNITS = 2;
export const SURPRISE_SET_MIN_DISTINCT_ITEMS = 2;
export const SURPRISE_SET_ITEM_NAME_MAX_LEN = 48;
/** Highest item MSRP a seller may declare for one item. */
export const SURPRISE_SET_MAX_ITEM_MSRP_USD = 5000;
/** Heaviest single item a seller may declare (carrier hard limit is 70 lb). */
export const SURPRISE_SET_MAX_ITEM_WEIGHT_OZ = 1120;
/** Smallest "max ounces per label" a seller may set, and the largest (70 lb). */
export const SURPRISE_SET_MIN_LABEL_WEIGHT_OZ = 16;
export const SURPRISE_SET_MAX_LABEL_WEIGHT_OZ = 1120;
/** Pool labels are capped at 64 chars server-side; leave room for the " (12 of 40)" suffix. */
const LABEL_MAX_LEN = 64;

export type SurpriseSetItemInput = {
  name: string;
  quantity: number;
  /** Manufacturer's suggested retail price per unit. Seller/admin only — never shown to buyers. */
  msrpUsd: number;
  /**
   * Shipping weight in ounces of ONE unit, packaging included (helmet ≈ 60). Optional — when blank the
   * unit ships at the show's normal spot weight. Seller/admin only.
   */
  weightOz?: number;
};

export type SurpriseSetItem = SurpriseSetItemInput;

export type SurpriseSetValidation =
  | { ok: true; items: SurpriseSetItem[]; totalUnits: number; topItemOdds: number }
  | { ok: false; message: string };

/** Wording TikTok-style rules and app-store review treat as gambling / value promises. */
const PROHIBITED_WORDING =
  /\b(jackpot|worth up to|worth at least|guaranteed (?:hit|value|win)|floor|ceiling|no duds|can't lose|cant lose|investment)\b/i;

export function findProhibitedSurpriseWording(text: string): string | null {
  const m = PROHIBITED_WORDING.exec(text);
  return m ? m[1]!.toLowerCase() : null;
}

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, SURPRISE_SET_ITEM_NAME_MAX_LEN);
}

/** Validate a raw payload (client form or API body) and merge duplicate names. */
export function validateSurpriseSetItems(
  raw: unknown,
  title?: string,
  /** Price the buyer pays per unit. When given, it may not exceed the lowest retail price in the set. */
  unitPriceUsd?: number | null,
): SurpriseSetValidation {
  if (!Array.isArray(raw)) return { ok: false, message: 'Add the items in this set.' };

  const byKey = new Map<string, SurpriseSetItem>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const name = cleanName(e.name);
    if (!name) continue;
    const quantity = typeof e.quantity === 'number' ? Math.floor(e.quantity) : Number.NaN;
    const msrpUsd = typeof e.msrpUsd === 'number' ? Math.round(e.msrpUsd * 100) / 100 : Number.NaN;
    if (!Number.isFinite(quantity) || quantity < 1) {
      return { ok: false, message: `Enter a quantity of at least 1 for “${name}”.` };
    }
    if (!Number.isFinite(msrpUsd) || msrpUsd <= 0) {
      return { ok: false, message: `Enter the retail price (MSRP) for “${name}”.` };
    }
    if (msrpUsd > SURPRISE_SET_MAX_ITEM_MSRP_USD) {
      return {
        ok: false,
        message: `“${name}” is over the $${SURPRISE_SET_MAX_ITEM_MSRP_USD.toLocaleString('en-US')} per-item limit for Surprise Sets.`,
      };
    }
    const banned = findProhibitedSurpriseWording(name);
    if (banned) {
      return { ok: false, message: `Item names can’t use the word “${banned}”.` };
    }
    // Weight is optional: blank / 0 / missing means "use the show's normal spot weight".
    let weightOz: number | undefined;
    if (e.weightOz != null && !(typeof e.weightOz === 'number' && e.weightOz === 0)) {
      if (typeof e.weightOz !== 'number' || !Number.isFinite(e.weightOz) || e.weightOz < 0) {
        return { ok: false, message: `Enter the shipping weight in ounces for “${name}”, or leave it blank.` };
      }
      if (e.weightOz > SURPRISE_SET_MAX_ITEM_WEIGHT_OZ) {
        return {
          ok: false,
          message: `“${name}” is over the ${SURPRISE_SET_MAX_ITEM_WEIGHT_OZ} oz (70 lb) shipping limit.`,
        };
      }
      weightOz = Math.round(e.weightOz * 10) / 10;
    }
    const key = `${name.toLowerCase()}|${msrpUsd}|${weightOz ?? ''}`;
    const existing = byKey.get(key);
    if (existing) existing.quantity += quantity;
    else byKey.set(key, weightOz != null ? { name, quantity, msrpUsd, weightOz } : { name, quantity, msrpUsd });
  }

  const items = [...byKey.values()];
  // Two entries with the same name but different MSRP would produce ambiguous odds / labels.
  const names = new Set<string>();
  for (const item of items) {
    const n = item.name.toLowerCase();
    if (names.has(n)) {
      return { ok: false, message: `“${item.name}” is listed twice with a different price or weight. Use one price and weight per item.` };
    }
    names.add(n);
  }

  if (items.length < SURPRISE_SET_MIN_DISTINCT_ITEMS) {
    return { ok: false, message: `A Surprise Set needs at least ${SURPRISE_SET_MIN_DISTINCT_ITEMS} different items.` };
  }
  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
  if (totalUnits < SURPRISE_SET_MIN_UNITS) {
    return { ok: false, message: `Add at least ${SURPRISE_SET_MIN_UNITS} units.` };
  }
  if (totalUnits > SURPRISE_SET_MAX_UNITS) {
    return { ok: false, message: `A set can hold at most ${SURPRISE_SET_MAX_UNITS} units (you have ${totalUnits}).` };
  }

  const topMsrp = Math.max(...items.map((i) => i.msrpUsd));
  const topUnits = items.filter((i) => i.msrpUsd === topMsrp).reduce((sum, i) => sum + i.quantity, 0);
  // No minimum odds for the top item: a single 1-of-500 chase unit is allowed. Buyers still see
  // every item's live odds (RandomRevealDisclosure) and confirm 18+ before they can pay.
  const topItemOdds = topUnits / totalUnits;

  // Price floor: a buyer must never pay more than the retail value of the least valuable unit.
  if (typeof unitPriceUsd === 'number' && Number.isFinite(unitPriceUsd)) {
    const lowest = items.reduce((a, b) => (b.msrpUsd < a.msrpUsd ? b : a));
    if (Math.round(unitPriceUsd * 100) > Math.round(lowest.msrpUsd * 100)) {
      return {
        ok: false,
        message: `The price per unit ($${unitPriceUsd.toFixed(2)}) can’t be higher than the retail price of the lowest-value item, “${lowest.name}” ($${lowest.msrpUsd.toFixed(2)}). Lower the price or remove that item, so every buyer gets at least what they paid for.`,
      };
    }
  }

  if (title) {
    const banned = findProhibitedSurpriseWording(title);
    if (banned) return { ok: false, message: `The title can’t use the word “${banned}”.` };
  }

  return { ok: true, items, totalUnits, topItemOdds };
}

/** One unique pool label per physical unit: "Name" for a single unit, "Name (2 of 3)" otherwise. */
export function expandSurpriseSetLabels(items: SurpriseSetItem[]): string[] {
  const labels: string[] = [];
  for (const item of items) {
    if (item.quantity === 1) {
      labels.push(item.name.slice(0, LABEL_MAX_LEN));
      continue;
    }
    for (let k = 1; k <= item.quantity; k++) {
      const suffix = ` (${k} of ${item.quantity})`;
      labels.push(`${item.name.slice(0, LABEL_MAX_LEN - suffix.length)}${suffix}`);
    }
  }
  return labels;
}

const UNIT_SUFFIX = /^(.*) \(\d+ of \d+\)$/;

/** The item name behind a pool label (strips the "(k of n)" unit suffix). */
export function surpriseSetItemNameFromLabel(label: string): string {
  const m = UNIT_SUFFIX.exec(label.trim());
  return (m ? m[1]! : label).trim();
}

export type SurpriseSetOddsRow = { name: string; remaining: number; odds: number };

/**
 * Remaining odds per item, from the set definition and the labels already claimed.
 * Odds are by unit count — every remaining unit is equally likely to be drawn.
 */
export function computeSurpriseSetOdds(
  items: ReadonlyArray<{ name: string; quantity: number }>,
  claimedLabels: ReadonlyArray<string>,
): { rows: SurpriseSetOddsRow[]; remainingUnits: number } {
  const claimedByName = new Map<string, number>();
  for (const label of claimedLabels) {
    const key = surpriseSetItemNameFromLabel(label).toLowerCase();
    claimedByName.set(key, (claimedByName.get(key) ?? 0) + 1);
  }
  const rows = items.map((item) => {
    const claimed = claimedByName.get(item.name.trim().toLowerCase()) ?? 0;
    return { name: item.name, remaining: Math.max(0, item.quantity - claimed), odds: 0 };
  });
  const remainingUnits = rows.reduce((sum, r) => sum + r.remaining, 0);
  for (const r of rows) r.odds = remainingUnits > 0 ? r.remaining / remainingUnits : 0;
  return { rows: rows.filter((r) => r.remaining > 0), remainingUnits };
}

export function formatOddsPercent(odds: number): string {
  const pct = odds * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1).replace(/\.0$/, '')}%`;
}

/**
 * Validate the seller's "max ounces per label" for a set. Blank/null = no limit (one label per buyer
 * unless another shipping rule splits it).
 */
export function validateSurpriseSetMaxLabelWeightOz(
  raw: unknown,
): { ok: true; value: number | null } | { ok: false; message: string } {
  if (raw == null || raw === '') return { ok: true, value: null };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, message: 'Enter the max ounces per label as a number, or leave it blank.' };
  if (n < SURPRISE_SET_MIN_LABEL_WEIGHT_OZ || n > SURPRISE_SET_MAX_LABEL_WEIGHT_OZ) {
    return {
      ok: false,
      message: `Max ounces per label must be between ${SURPRISE_SET_MIN_LABEL_WEIGHT_OZ} and ${SURPRISE_SET_MAX_LABEL_WEIGHT_OZ}.`,
    };
  }
  return { ok: true, value: Math.round(n * 10) / 10 };
}

/**
 * Shipping weight (oz) of the item a pool label draws, read from the stored set JSON. Null when the
 * item has no declared weight (or the label isn't in the set).
 */
export function surpriseSetWeightOzForLabel(rawItems: unknown, label: string): number | null {
  if (!Array.isArray(rawItems)) return null;
  const wanted = surpriseSetItemNameFromLabel(label).toLowerCase();
  for (const entry of rawItems) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { name?: unknown; weightOz?: unknown };
    if (typeof e.name !== 'string' || e.name.trim().toLowerCase() !== wanted) continue;
    return typeof e.weightOz === 'number' && Number.isFinite(e.weightOz) && e.weightOz > 0 ? e.weightOz : null;
  }
  return null;
}
