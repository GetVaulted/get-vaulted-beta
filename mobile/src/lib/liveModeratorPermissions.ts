export type LiveViewerRole = 'buyer' | 'host' | 'moderator';

export type LiveModeratorLevel = 'chat' | 'show' | 'break' | 'head';

const LEVEL_RANK: Record<LiveModeratorLevel, number> = {
  chat: 1,
  show: 2,
  break: 3,
  head: 4,
};

const ACTION_MIN_LEVEL: Record<string, LiveModeratorLevel> = {
  delete_message: 'chat',
  mute: 'chat',
  unmute: 'chat',
  timeout: 'chat',
  pin_message: 'show',
  post_announcement: 'show',
  run_giveaway: 'show',
  slow_mode: 'show',
  block_bidding: 'break',
  unblock_bidding: 'break',
  kick: 'show',
  room_ban: 'head',
  unban: 'head',
  seller_stream_ban: 'head',
};

export function effectiveModeratorLevel(args: {
  isHost: boolean;
  moderatorLevel: LiveModeratorLevel | null;
  isModerator?: boolean;
}): LiveModeratorLevel | null {
  if (args.isHost) return 'head';
  if (args.moderatorLevel) return args.moderatorLevel;
  // Assigned mods default to show level in the DB when level is missing on the snapshot.
  if (args.isModerator) return 'show';
  return null;
}

export function listAllowedModerationActions(args: {
  isHost: boolean;
  moderatorLevel: LiveModeratorLevel | null;
  isModerator?: boolean;
}): string[] {
  const level = effectiveModeratorLevel(args);
  if (!level) return [];
  const rank = LEVEL_RANK[level];
  return (Object.entries(ACTION_MIN_LEVEL) as [string, LiveModeratorLevel][])
    .filter(([, minLevel]) => rank >= LEVEL_RANK[minLevel])
    .map(([action]) => action);
}

export type ModerationActorContext = {
  canModerate: boolean;
  isHost: boolean;
  isModerator: boolean;
  viewerRole: LiveViewerRole;
  moderatorLevel: LiveModeratorLevel | null;
  allowedActions: string[];
  showHostUserId: string | undefined;
};

/** Merge API moderation snapshot with local seller/host hints so tools stay available on the command center. */
export function resolveModerationActor(args: {
  canModerate: boolean;
  isHost: boolean;
  isModerator: boolean;
  viewerRole: LiveViewerRole;
  moderatorLevel: LiveModeratorLevel | null;
  allowedActions: string[];
  sellerId?: string;
  userId?: string | null;
  sellerIdHint?: string | null;
  hostUserIdHint?: string | null;
}): ModerationActorContext {
  const sellerId = args.sellerId?.trim() || args.sellerIdHint?.trim() || undefined;
  const userId = args.userId?.trim() || undefined;
  const hostUserId = resolveShowHostUserId(sellerId, args.hostUserIdHint?.trim() || userId);
  const localIsHost = Boolean(hostUserId && userId && hostUserId === userId);

  const isHost = args.isHost || localIsHost;
  const isModerator = args.isModerator;
  const canModerate = args.canModerate || isHost || isModerator;
  const moderatorLevel = isHost ? 'head' : args.moderatorLevel;
  const viewerRole: LiveViewerRole = isHost ? 'host' : isModerator ? 'moderator' : args.viewerRole;
  const effectiveLevel = effectiveModeratorLevel({ isHost, moderatorLevel, isModerator });
  const allowedActions =
    canModerate && args.allowedActions.length > 0
      ? args.allowedActions
      : listAllowedModerationActions({ isHost, moderatorLevel, isModerator });

  return {
    canModerate,
    isHost,
    isModerator,
    viewerRole,
    moderatorLevel: effectiveLevel,
    allowedActions,
    showHostUserId: hostUserId,
  };
}

export function canPerformModeratorAction(args: {
  actionType: string;
  isModerator: boolean;
  isHost?: boolean;
  canModerate?: boolean;
  moderatorLevel: LiveModeratorLevel | null;
  allowedActions?: string[];
}): boolean {
  const mayModerate = Boolean(args.isHost) || Boolean(args.isModerator) || Boolean(args.canModerate);
  if (!mayModerate) return false;

  const level = effectiveModeratorLevel({
    isHost: Boolean(args.isHost),
    moderatorLevel: args.moderatorLevel,
    isModerator: args.isModerator,
  });
  if (!level) return false;

  if (args.allowedActions?.length && args.allowedActions.includes(args.actionType)) {
    return true;
  }

  const required = ACTION_MIN_LEVEL[args.actionType];
  if (!required) return Boolean(args.isHost);
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

/** True when the target is the live show host/seller — the only user mods cannot punish. */
export function isLiveRoomHostUser(
  hostUserId: string | undefined,
  targetUserId: string | undefined,
): boolean {
  return Boolean(hostUserId && targetUserId && hostUserId === targetUserId);
}

/** Host protection for chat rows — seller id match and/or host badge on the message. */
export function isProtectedShowHost(args: {
  hostUserId?: string;
  targetUserId?: string;
  messageIsHost?: boolean;
}): boolean {
  if (args.messageIsHost) return true;
  return isLiveRoomHostUser(args.hostUserId, args.targetUserId);
}

/** Resolve canonical show host id (seller) for moderation guards. */
export function resolveShowHostUserId(
  sellerId: string | undefined,
  fallbackHostUserId: string | undefined,
): string | undefined {
  return sellerId?.trim() || fallbackHostUserId?.trim() || undefined;
}

export function formatModeratorLevelLabel(level: LiveModeratorLevel | null | undefined): string | null {
  if (!level) return null;
  const labels: Record<LiveModeratorLevel, string> = {
    chat: 'Chat mod',
    show: 'Show mod',
    break: 'Break mod',
    head: 'Head mod',
  };
  return labels[level] ?? null;
}

/** Mod tools shield — assigned moderators and hosts with moderation access. */
export function showModeratorTools(
  isModerator: boolean,
  canModerate?: boolean,
  isHost?: boolean,
): boolean {
  return Boolean(isModerator) || Boolean(canModerate) || Boolean(isHost);
}

export const TIMEOUT_MINUTES = [5, 30, 60, 24 * 60] as const;

export function formatModActionLabel(actionType: string): string {
  switch (actionType) {
    case 'delete_message':
      return 'Delete message';
    case 'timeout':
      return 'Timeout';
    case 'mute':
      return 'Mute user';
    case 'kick':
      return 'Kick from stream';
    case 'room_ban':
      return 'Ban from stream';
    case 'seller_stream_ban':
      return 'Ban from seller streams';
    case 'pin_message':
      return 'Pin message';
    case 'post_announcement':
      return 'Announcement';
    case 'run_giveaway':
      return 'Giveaway';
    case 'block_bidding':
      return 'Block bidding';
    default:
      return actionType.replace(/_/g, ' ');
  }
}
