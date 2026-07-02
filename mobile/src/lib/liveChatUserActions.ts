import { Alert } from 'react-native';
import { canPerformModeratorAction, type LiveModeratorLevel } from './liveModeratorPermissions';
import { formatChatDisplayName } from './liveRoomChatMessages';

export type LiveChatModerationActionType =
  | 'kick'
  | 'unkick'
  | 'room_ban'
  | 'unban'
  | 'seller_stream_ban'
  | 'seller_stream_unban';

export function appendMentionToDraft(draft: string, username: string): string {
  const handle = username.replace(/^@/, '').trim();
  if (!handle) return draft;
  const prefix = draft.length > 0 && !/\s$/.test(draft) ? `${draft} ` : draft;
  return `${prefix}@${handle} `;
}

function isAssignedModerationStaff(args: { isHost?: boolean; isModerator?: boolean }): boolean {
  return Boolean(args.isHost) || Boolean(args.isModerator);
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
  if (!isAssignedModerationStaff(args)) return false;
  if (!args.targetUserId?.trim()) return false;
  if (args.hostUserId && args.targetUserId === args.hostUserId) return false;
  return canPerformModeratorAction({
    actionType: 'kick',
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
  isHost?: boolean;
  isModerator?: boolean;
  canModerate?: boolean;
  moderatorLevel?: LiveModeratorLevel | null;
  allowedActions: string[];
}): boolean {
  if (!isAssignedModerationStaff(args)) return false;
  if (!args.targetUserId?.trim()) return false;
  if (args.hostUserId && args.targetUserId === args.hostUserId) return false;
  return canPerformModeratorAction({
    actionType: 'room_ban',
    isHost: Boolean(args.isHost),
    isModerator: Boolean(args.isModerator),
    canModerate: Boolean(args.canModerate),
    moderatorLevel: args.moderatorLevel ?? null,
    allowedActions: args.allowedActions,
  });
}

export function canShowLiveChatRemoveKickOption(args: {
  targetUserId?: string;
  hostUserId?: string;
  isHost?: boolean;
  isModerator?: boolean;
  canModerate?: boolean;
  moderatorLevel?: LiveModeratorLevel | null;
  allowedActions: string[];
}): boolean {
  if (!isAssignedModerationStaff(args)) return false;
  if (!args.targetUserId?.trim()) return false;
  if (args.hostUserId && args.targetUserId === args.hostUserId) return false;
  return canPerformModeratorAction({
    actionType: 'unkick',
    isHost: Boolean(args.isHost),
    isModerator: Boolean(args.isModerator),
    canModerate: Boolean(args.canModerate),
    moderatorLevel: args.moderatorLevel ?? null,
    allowedActions: args.allowedActions,
  });
}

export function canShowLiveChatRemoveRoomBanOption(args: {
  targetUserId?: string;
  hostUserId?: string;
  isHost?: boolean;
  isModerator?: boolean;
  canModerate?: boolean;
  moderatorLevel?: LiveModeratorLevel | null;
  allowedActions: string[];
}): boolean {
  if (!isAssignedModerationStaff(args)) return false;
  if (!args.targetUserId?.trim()) return false;
  if (args.hostUserId && args.targetUserId === args.hostUserId) return false;
  return canPerformModeratorAction({
    actionType: 'unban',
    isHost: Boolean(args.isHost),
    isModerator: Boolean(args.isModerator),
    canModerate: Boolean(args.canModerate),
    moderatorLevel: args.moderatorLevel ?? null,
    allowedActions: args.allowedActions,
  });
}

export function canShowLiveChatRemoveSellerBanOption(args: {
  targetUserId?: string;
  hostUserId?: string;
  isHost?: boolean;
  isModerator?: boolean;
  canModerate?: boolean;
  moderatorLevel?: LiveModeratorLevel | null;
  allowedActions: string[];
}): boolean {
  if (!isAssignedModerationStaff(args)) return false;
  if (!args.targetUserId?.trim()) return false;
  if (args.hostUserId && args.targetUserId === args.hostUserId) return false;
  return canPerformModeratorAction({
    actionType: 'seller_stream_unban',
    isHost: Boolean(args.isHost),
    isModerator: Boolean(args.isModerator),
    canModerate: Boolean(args.canModerate),
    moderatorLevel: args.moderatorLevel ?? null,
    allowedActions: args.allowedActions,
  });
}

function confirmRemoveKick(displayName: string, onConfirm: () => void) {
  Alert.alert('Remove kick?', `${displayName} can rejoin this show immediately.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove kick', onPress: onConfirm },
  ]);
}

function confirmRemoveRoomBan(displayName: string, onConfirm: () => void) {
  Alert.alert('Remove room ban?', `${displayName} can rejoin this show immediately.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove ban', onPress: onConfirm },
  ]);
}

function confirmRemoveSellerBan(displayName: string, onConfirm: () => void) {
  Alert.alert('Remove seller ban?', `${displayName} can join this seller's future shows again.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove ban', onPress: onConfirm },
  ]);
}

export type LiveChatUserModerationHandlers = {
  canKickFromShow: boolean;
  canBanFromShow: boolean;
  canRemoveKick?: boolean;
  canRemoveRoomBan?: boolean;
  canRemoveSellerBan?: boolean;
  onKickFromShow: () => void;
  onBanFromShow: () => void;
  onRemoveKick?: () => void;
  onRemoveRoomBan?: () => void;
  onRemoveSellerBan?: () => void;
};

function confirmKickFromShow(displayName: string, onConfirm: () => void) {
  Alert.alert(
    'Kick from show?',
    `${displayName} will be removed from this show for several hours.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Kick from show', style: 'destructive', onPress: onConfirm },
    ],
  );
}

function confirmBanFromShow(displayName: string, onConfirm: () => void) {
  Alert.alert(
    'Ban from show?',
    `${displayName} will be removed and cannot return to this show.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Ban from show', style: 'destructive', onPress: onConfirm },
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
  if (args.moderation?.canBanFromShow) {
    buttons.push({
      text: 'Ban from show',
      style: 'destructive',
      onPress: () => confirmBanFromShow(name, args.moderation!.onBanFromShow),
    });
  }
  if (args.moderation?.canRemoveKick && args.moderation.onRemoveKick) {
    buttons.push({
      text: 'Remove kick',
      onPress: () => confirmRemoveKick(name, args.moderation!.onRemoveKick!),
    });
  }
  if (args.moderation?.canRemoveRoomBan && args.moderation.onRemoveRoomBan) {
    buttons.push({
      text: 'Remove room ban',
      onPress: () => confirmRemoveRoomBan(name, args.moderation!.onRemoveRoomBan!),
    });
  }
  if (args.moderation?.canRemoveSellerBan && args.moderation.onRemoveSellerBan) {
    buttons.push({
      text: 'Remove seller ban',
      onPress: () => confirmRemoveSellerBan(name, args.moderation!.onRemoveSellerBan!),
    });
  }
  buttons.push({ text: 'Cancel', style: 'cancel' });
  Alert.alert(name, undefined, buttons);
}
