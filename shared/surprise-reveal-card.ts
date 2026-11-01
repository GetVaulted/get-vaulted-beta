/**
 * Surprise Set reveal card — the TikTok-style "Randomizing for @buyer…" card that shuffles the set's
 * item names (blurred) and locks onto what the buyer won.
 *
 * Shared by web and mobile so every viewer sees the identical shuffle: the sequence is derived from
 * the spin id, not from Math.random(). Keep this file dependency-free.
 */

export const SURPRISE_CARD_STYLE = 'surprise_card' as const;

/** Card slides in. */
export const SURPRISE_CARD_INTRO_MS = 350;
/** Names shuffle, fast then slowing down. */
export const SURPRISE_CARD_SHUFFLE_MS = 3200;
/** Winner locked in and shown. */
export const SURPRISE_CARD_HOLD_MS = 3200;
/** Card slides out. */
export const SURPRISE_CARD_OUTRO_MS = 300;
export const SURPRISE_CARD_TOTAL_MS =
  SURPRISE_CARD_INTRO_MS + SURPRISE_CARD_SHUFFLE_MS + SURPRISE_CARD_HOLD_MS + SURPRISE_CARD_OUTRO_MS;

/** Item names shown while shuffling are capped so a huge set doesn't bloat the realtime payload. */
export const SURPRISE_CARD_MAX_ITEMS = 40;

export type SurpriseCardFields = {
  style: typeof SURPRISE_CARD_STYLE;
  /** Distinct item names to cycle through while shuffling (always includes the winner). */
  cardItems: string[];
  /** Item name the buyer won (unit suffix like "(3 of 40)" stripped). */
  cardWinner: string;
};

export type SurpriseCardShuffleStep = {
  name: string;
  /** How long this name stays on screen before the next one. */
  holdMs: number;
};

const UNIT_SUFFIX = /^(.*) \(\d+ of \d+\)$/;

function itemNameFromLabel(label: string): string {
  const m = UNIT_SUFFIX.exec(label.trim());
  return (m ? m[1]! : label).trim();
}

/**
 * Build the card fields for a Surprise Set draw.
 * @param itemNames every item name in the set (order kept)
 * @param winnerLabel the drawn pool label, e.g. "Random Pack 3 (12 of 34)"
 */
export function buildSurpriseCardFields(itemNames: readonly string[], winnerLabel: string): SurpriseCardFields | null {
  const winner = itemNameFromLabel(winnerLabel);
  if (!winner) return null;
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of itemNames) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  if (!seen.has(winner.toLowerCase())) names.push(winner);
  // Keep the winner when trimming a very large set.
  let cardItems = names;
  if (names.length > SURPRISE_CARD_MAX_ITEMS) {
    const others = names.filter((n) => n.toLowerCase() !== winner.toLowerCase()).slice(0, SURPRISE_CARD_MAX_ITEMS - 1);
    cardItems = [...others, winner];
  }
  return { style: SURPRISE_CARD_STYLE, cardItems, cardWinner: winner };
}

/** Read card fields off a raw spin payload; null when this spin isn't a Surprise Set card. */
export function parseSurpriseCardFields(raw: unknown): SurpriseCardFields | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.style !== SURPRISE_CARD_STYLE) return null;
  const winner = typeof o.cardWinner === 'string' ? o.cardWinner.trim() : '';
  if (!winner) return null;
  const items = Array.isArray(o.cardItems)
    ? o.cardItems.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim())
    : [];
  if (!items.some((n) => n.toLowerCase() === winner.toLowerCase())) items.push(winner);
  return { style: SURPRISE_CARD_STYLE, cardItems: items.slice(0, SURPRISE_CARD_MAX_ITEMS + 1), cardWinner: winner };
}

/** FNV-1a hash → seed, so the same spin id always produces the same shuffle. */
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The name sequence for the shuffle phase: starts fast (~60ms per name), eases to ~420ms, and the
 * final step is always the winner. Never shows the same name twice in a row (when there's a choice).
 * Total of all `holdMs` ≈ SURPRISE_CARD_SHUFFLE_MS.
 */
export function buildSurpriseCardShuffle(
  fields: Pick<SurpriseCardFields, 'cardItems' | 'cardWinner'>,
  seedKey: string,
): SurpriseCardShuffleStep[] {
  const winner = fields.cardWinner;
  const pool = fields.cardItems.length > 0 ? fields.cardItems : [winner];
  const rand = mulberry32(hashSeed(seedKey));

  const minHold = 60;
  const maxHold = 420;
  const steps: SurpriseCardShuffleStep[] = [];
  let elapsed = 0;
  let prev = '';
  // Reserve the final (longest) step for the winner.
  const budget = SURPRISE_CARD_SHUFFLE_MS - maxHold;
  while (elapsed < budget) {
    const progress = elapsed / budget;
    const holdMs = Math.round(minHold + (maxHold - minHold) * progress ** 2.4);
    let name = pool[Math.floor(rand() * pool.length)]!;
    if (pool.length > 1) {
      let guard = 0;
      while ((name === prev || (progress > 0.85 && name === winner)) && guard++ < 8) {
        name = pool[Math.floor(rand() * pool.length)]!;
      }
    }
    steps.push({ name, holdMs });
    prev = name;
    elapsed += holdMs;
  }
  steps.push({ name: winner, holdMs: maxHold });
  return steps;
}

/** Sum of shuffle step durations (ms). */
export function surpriseCardShuffleDurationMs(steps: readonly SurpriseCardShuffleStep[]): number {
  return steps.reduce((sum, s) => sum + s.holdMs, 0);
}
