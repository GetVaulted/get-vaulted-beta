/** Matches server PATCH trim + slice on live room showNotes. */
export const LIVE_SHOW_NOTES_MAX_CHARS = 4000;

/** True when the room has seller-authored in-room show notes. */
export function hasLiveShowNotes(raw: string | null | undefined): boolean {
  return Boolean(raw?.trim());
}

export function normalizeLiveShowNotes(raw: string | null | undefined): string {
  return raw?.trim() ?? '';
}
