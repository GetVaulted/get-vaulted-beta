const DEFAULT_PIN_EXPIRES_MINUTES = 60;

export function isPinnedMessageActive(args: {
  message?: string | null;
  expiresAt?: string | null;
  pinnedAt?: string | null;
}): boolean {
  const body = args.message?.trim();
  if (!body) return false;

  const expiresAt = args.expiresAt?.trim();
  if (expiresAt) {
    const exp = new Date(expiresAt);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() <= Date.now()) return false;
    return true;
  }

  const pinnedAt = args.pinnedAt?.trim();
  if (!pinnedAt) return true;

  const pinned = new Date(pinnedAt);
  if (Number.isNaN(pinned.getTime())) return true;

  const legacyExpiry = pinned.getTime() + DEFAULT_PIN_EXPIRES_MINUTES * 60 * 1000;
  return legacyExpiry > Date.now();
}

export function msUntilPinnedMessageExpires(args: {
  expiresAt?: string | null;
  pinnedAt?: string | null;
}): number | null {
  const expiresAt = args.expiresAt?.trim();
  if (expiresAt) {
    const exp = new Date(expiresAt);
    if (Number.isNaN(exp.getTime())) return null;
    return exp.getTime() - Date.now();
  }

  const pinnedAt = args.pinnedAt?.trim();
  if (!pinnedAt) return null;
  const pinned = new Date(pinnedAt);
  if (Number.isNaN(pinned.getTime())) return null;
  return pinned.getTime() + DEFAULT_PIN_EXPIRES_MINUTES * 60 * 1000 - Date.now();
}

export function computePinExpiresIso(pinnedAt: Date, expiresMinutes: number): string | null {
  if (!Number.isFinite(expiresMinutes) || expiresMinutes <= 0) return null;
  return new Date(pinnedAt.getTime() + expiresMinutes * 60 * 1000).toISOString();
}
