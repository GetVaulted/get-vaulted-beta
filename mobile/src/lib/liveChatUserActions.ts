import { Alert } from 'react-native';
import { canPerformModeratorAction, type LiveModeratorLevel } from './liveModeratorPermissions';
import { formatChatDisplayName } from './liveRoomChatMessages';

export function appendMentionToDraft(draft: string, username: string): string {
  const handle = username.replace(/^@/, '').trim();
  if (!handle) return draft;
  const prefix = draft.length > 0 && !/\s$/.test(draft) ? `${draft} ` : draft;
  return `${prefix}@${handle} `;
}

export function canShowLiveChatKickOption(args: {
  targetUserId?: string;
  hostUserId?: string;
  allowedActions: string[];
  isHost?: boolean;
  isModerator?: boolean;
  canModerate?: boolean;
  moderatorLevel?: LiveModeratorLevel | null;
}): boolean {
  if (!args.targetUserId?.trim()) return false;
  if (args.hostUserId && args.targetUserId === args.hostUserId) return false;
  if (
    canPerformModeratorAction({
      actionType: 'kick',
      isHost: Boolean(args.isHost),
      isModerator: Boolean(args.isModerator),
      canModerate: Boolean(args.canModerate),
      moderatorLevel: args.moderatorLevel ?? null,
      allowedActions: args.allowedActions,
    })
  ) {
    return true;
  }
  return canPerformModeratorAction({
    actionType: 'room_ban',
    isHost: Boolean(args.isHost),
    isModerator: Boolean(args.isModerator),
    canModerate: Boolean(args.canModerate),
    moderatorLevel: args.moderatorLevel ?? null,
    allowedActions: args.allowedActions,
  });
}

export function canShowLiveChatBanOption(args: {
  targetUserId?: string;
  hostUserId?: string;
  isHost: boolean;
  allowedActions: string[];
}): boolean {
  if (!args.isHost || !args.targetUserId?.trim()) return false;
  if (args.hostUserId && args.targetUserId === args.hostUserId) return false;
  return args.allowedActions.includes('seller_stream_ban');
}

export type LiveChatUserModerationHandlers = {
  canKickFromShow: boolean;
  canBanFromSeller: boolean;
  onKickFromShow: () => void;
  onBanFromSeller: () => void;
};

function confirmKickFromShow(displayName: string, onConfirm: () => void) {
  Alert.alert(
    'Kick from show?',
    `${displayName} will be removed and cannot return to this show.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Kick from show', style: 'destructive', onPress: onConfirm },
    ],
  );
}

function confirmBanFromSeller(displayName: string, onConfirm: () => void) {
  Alert.alert(
    'Ban from all shows?',
    `${displayName} will be blocked from every show hosted by this seller.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Ban from all shows', style: 'destructive', onPress: onConfirm },
    ],
  );
}

export function promptLiveChatUserAction(args: {
  username: string;
  userId?: string;
  onTag: (username: string) => void;
  onViewProfile?: (userId: string) => void;
  moderation?: LiveChatUserModerationHandlers;
}) {
  const name = formatChatDisplayName(args.username);
  const buttons: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
    { text: 'Mention in chat', onPress: () => args.onTag(args.username) },
  ];
  if (args.userId && args.onViewProfile) {
    buttons.push({ text: 'View profile', onPress: () => args.onViewProfile!(args.userId!) });
  }
  if (args.moderation?.canKickFromShow) {
    buttons.push({
      text: 'Kick from show',
      style: 'destructive',
      onPress: () => confirmKickFromShow(name, args.moderation!.onKickFromShow),
    });
  }
  if (args.moderation?.canBanFromSeller) {
    buttons.push({
      text: 'Ban from all shows',
      style: 'destructive',
      onPress: () => confirmBanFromSeller(name, args.moderation!.onBanFromSeller),
    });
  }
  buttons.push({ text: 'Cancel', style: 'cancel' });
  Alert.alert(name, undefined, buttons);
}
