/** Trimmed avatar URL or null when the user has not chosen a profile photo. */
export function normalizeAvatarUri(uri?: string | null): string | null {
  const trimmed = uri?.trim();
  return trimmed || null;
}

/** First initial from display name, username, or handle (strips leading @). */
export function profileDisplayInitial(...labels: (string | null | undefined)[]): string {
  for (const label of labels) {
    const trimmed = label?.trim();
    if (!trimmed || trimmed === '?' || trimmed === 'Guest' || trimmed === 'System') continue;
    const clean = trimmed.replace(/^@+/, '');
    if (clean) return clean.charAt(0).toUpperCase();
  }
  return '?';
}
