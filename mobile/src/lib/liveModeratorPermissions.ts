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
  kick: 'head',
  room_ban: 'head',
  unban: 'head',
  seller_stream_ban: 'head',
};

export function canPerformModeratorAction(args: {
  actionType: string;
  isModerator: boolean;
  isHost?: boolean;
  moderatorLevel: LiveModeratorLevel | null;
  allowedActions?: string[];
}): boolean {
  if (!args.isModerator) return false;
  if (args.allowedActions?.length) {
    return args.allowedActions.includes(args.actionType);
  }
  const level: LiveModeratorLevel | null =
    args.isHost && args.isModerator ? 'head' : args.moderatorLevel;
  if (!level) return false;
  const required = ACTION_MIN_LEVEL[args.actionType];
  if (!required) return Boolean(args.isHost && args.isModerator);
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

/** Mod tools shield — explicit moderator assignment only (not host/seller/creator by default). */
export function showModeratorTools(isModerator: boolean): boolean {
  return isModerator;
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
