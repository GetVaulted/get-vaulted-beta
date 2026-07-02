const PLACEHOLDER_USERNAMES = new Set(['member', 'guest']);

export function isPlaceholderModeratorUsername(username: unknown): boolean {
  if (typeof username !== 'string') return true;
  const trimmed = username.trim().replace(/^@/, '').toLowerCase();
  return trimmed.length === 0 || PLACEHOLDER_USERNAMES.has(trimmed);
}

export function resolveModeratorRoomUsername(
  candidates: Array<string | null | undefined>,
  userId?: string | null,
): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && !isPlaceholderModeratorUsername(candidate)) {
      return candidate.trim().replace(/^@/, '');
    }
  }
  if (userId?.trim()) return `user-${userId.trim().slice(-6)}`;
  return 'Guest';
}

export function buildModeratorUsernameHints(args: {
  resolved?: Record<string, string>;
  moderators?: Array<{ userId: string; username?: string | null }>;
  viewers?: Array<{ userId: string; username?: string | null }>;
  modHistory?: Array<{
    targetUserId?: string | null;
    targetUsername?: string | null;
    moderatorUserId?: string;
    moderatorUsername?: string | null;
  }>;
}): Record<string, string> {
  const map: Record<string, string> = { ...(args.resolved ?? {}) };

  const put = (userId: string | null | undefined, username: string | null | undefined) => {
    const id = userId?.trim();
    if (!id || !username?.trim() || isPlaceholderModeratorUsername(username)) return;
    map[id] = username.trim().replace(/^@/, '');
  };

  for (const row of args.moderators ?? []) put(row.userId, row.username);
  for (const row of args.viewers ?? []) put(row.userId, row.username);
  for (const row of args.modHistory ?? []) {
    put(row.targetUserId, row.targetUsername);
    put(row.moderatorUserId, row.moderatorUsername);
  }

  return map;
}
