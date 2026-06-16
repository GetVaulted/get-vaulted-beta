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
  viewerRole: LiveViewerRole;
  moderatorLevel: LiveModeratorLevel | null;
  allowedActions?: string[];
}): boolean {
  if (args.allowedActions?.length) {
    return args.allowedActions.includes(args.actionType);
  }
  if (args.viewerRole === 'buyer') return false;
  const level: LiveModeratorLevel | null =
    args.viewerRole === 'host' ? 'head' : args.moderatorLevel;
  if (!level) return false;
  const required = ACTION_MIN_LEVEL[args.actionType];
  if (!required) return args.viewerRole === 'host';
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

export function showModeratorTools(viewerRole: LiveViewerRole): boolean {
  return viewerRole === 'host' || viewerRole === 'moderator';
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
