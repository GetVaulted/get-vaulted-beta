/** Matches server PATCH trim + slice on live room description. */
export const LIVE_SHOW_NOTES_MAX_CHARS = 4000;

const PLACEHOLDER_NOTES = new Set([
  'live on get vaulted.',
  'show notes will appear when the host publishes them.',
]);

/** True when the room has seller-authored show notes (not discovery placeholders). */
export function hasLiveShowNotes(raw: string | null | undefined): boolean {
  const t = raw?.trim() ?? '';
  if (!t) return false;
  return !PLACEHOLDER_NOTES.has(t.toLowerCase());
}

export function normalizeLiveShowNotes(raw: string | null | undefined): string {
  return hasLiveShowNotes(raw) ? (raw?.trim() ?? '') : '';
}
