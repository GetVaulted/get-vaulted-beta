type ModeratorRow = { userId: string; username: string };

export function resolvePinnedModeratorUsername(args: {
  pinnedModeratorUsername?: string | null;
  pinnedModeratorUserId?: string | null;
  moderators?: ModeratorRow[];
}): string | null {
  const direct = args.pinnedModeratorUsername?.trim();
  if (direct) return direct;

  const userId = args.pinnedModeratorUserId?.trim();
  if (userId && args.moderators?.length) {
    const match = args.moderators.find((m) => m.userId === userId);
    const fromList = match?.username?.trim();
    if (fromList) return fromList;
  }

  return null;
}
