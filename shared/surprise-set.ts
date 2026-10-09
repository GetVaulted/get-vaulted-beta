/**
 * Surprise Sets — a sealed pool of items sold as identical-priced "units". The buyer pays one
 * price, the server draws one unit from what is left, and the reveal wheel shows the result.
 *
 * Built on the Random Player pool (`customRandomPoolLabels`): every physical unit becomes one
 * unique pool label, so the existing draw / unique-claim / reveal pipeline is reused unchanged.
 * This file is shared by web and mobile — keep it dependency-free.
 */

/** Hard cap on units in one set. Matches the random-pool label cap (PLAYER_SPOT_MAX). */
export const SURPRISE_SET_MAX_UNITS = 60;
export const SURPRISE_SET_MIN_UNITS = 2;
export const SURPRISE_SET_MIN_DISTINCT_ITEMS = 2;
export const SURPRISE_SET_ITEM_NAME_MAX_LEN = 48;
/** Highest item MSRP a seller may declare for one item. */
export const SURPRISE_SET_MAX_ITEM_MSRP_USD = 5000;
/** The highest-value item must be at least this likely to be drawn (by unit count). */
export const SURPRISE_SET_MIN_TOP_ITEM_ODDS = 0.05;
/** Pool labels are capped at 64 chars server-side; leave room for the " (12 of 40)" suffix. */
const LABEL_MAX_LEN = 64;

export type SurpriseSetItemInput = {
  name: string;
  quantity: number;
  /** Manufacturer's suggested retail price per unit. Seller/admin only — never shown to buyers. */
  msrpUsd: number;
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
    const key = `${name.toLowerCase()}|${msrpUsd}`;
    const existing = byKey.get(key);
    if (existing) existing.quantity += quantity;
    else byKey.set(key, { name, quantity, msrpUsd });
  }

  const items = [...byKey.values()];
  // Two entries with the same name but different MSRP would produce ambiguous odds / labels.
  const names = new Set<string>();
  for (const item of items) {
    const n = item.name.toLowerCase();
    if (names.has(n)) {
      return { ok: false, message: `“${item.name}” is listed twice with different prices. Use one price per item.` };
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
  const topItemOdds = topUnits / totalUnits;
  if (topItemOdds < SURPRISE_SET_MIN_TOP_ITEM_ODDS) {
    const needed = Math.ceil(totalUnits * SURPRISE_SET_MIN_TOP_ITEM_ODDS);
    return {
      ok: false,
      message: `The highest-value item must have at least a ${Math.round(SURPRISE_SET_MIN_TOP_ITEM_ODDS * 100)}% chance. Add more of it (at least ${needed} of ${totalUnits} units) or remove some other units.`,
    };
  }

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
