/** Host-pasted player lists for Pick Your Player / Random Player breaks. */

export const PLAYER_SPOT_MIN = 2;
export const PLAYER_SPOT_MAX = 60;
export const PLAYER_NAME_MAX_LEN = 64;

export type ParsePlayerSpotListResult =
  | { ok: true; names: string[] }
  | { ok: false; message: string; names?: string[] };

/**
 * Parse a multiline paste of player names.
 * Trims blanks, case-insensitive de-dupes (keeps first spelling), enforces 2–60.
 */
export function parsePlayerSpotList(text: string): ParsePlayerSpotListResult {
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const names: string[] = [];
  const seen = new Set<string>();

  for (const line of rawLines) {
    const name = line.trim().replace(/\s+/g, ' ').slice(0, PLAYER_NAME_MAX_LEN);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, message: `Duplicate: ${name}`, names };
    }
    seen.add(key);
    names.push(name);
    if (names.length > PLAYER_SPOT_MAX) {
      return {
        ok: false,
        message: `At most ${PLAYER_SPOT_MAX} players.`,
        names: names.slice(0, PLAYER_SPOT_MAX),
      };
    }
  }

  if (names.length < PLAYER_SPOT_MIN) {
    return {
      ok: false,
      message: `Add at least ${PLAYER_SPOT_MIN} player names (one per line).`,
      names,
    };
  }

  return { ok: true, names };
}

/** Build pick-mode variants from a validated name list. */
export function buildPlayerPickVariants(
  names: string[],
  priceUsd: number,
  priceByName?: Map<string, number>,
): Array<{
  label: string;
  priceUsd: number;
  quantityInitial: number;
  sortOrder: number;
  color: string;
}> {
  return names.map((label, sortOrder) => ({
    label,
    priceUsd: priceByName?.get(label.toLowerCase()) ?? priceUsd,
    quantityInitial: 1,
    sortOrder,
    color: 'PLAYER',
  }));
}

/** Single pool seat for random player reveal. */
export function buildRandomPlayerVariant(priceUsd: number, poolSize: number): {
  label: string;
  priceUsd: number;
  quantityInitial: number;
  sortOrder: number;
  color: string;
} {
  return {
    label: 'Random Player',
    priceUsd,
    quantityInitial: Math.max(1, poolSize),
    sortOrder: 0,
    color: 'player_list',
  };
}

/** Normalize JSON column / API payload into a clean string[]. */
export function normalizeCustomRandomPoolLabels(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const name = entry.trim().replace(/\s+/g, ' ').slice(0, PLAYER_NAME_MAX_LEN);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= PLAYER_SPOT_MAX) break;
  }
  return out.length >= PLAYER_SPOT_MIN ? out : null;
}

/** Short reel abbr from a player name (first word or truncated). */
export function playerSpotReelAbbr(label: string): string {
  const t = label.trim();
  if (!t) return '?';
  const first = t.split(/\s+/)[0] ?? t;
  return first.slice(0, 6).toUpperCase();
}
