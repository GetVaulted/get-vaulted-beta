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
  if (!args.targetUserId?.trim()) return false;
  if (args.hostUserId && args.targetUserId === args.hostUserId) return false;
  return canPerformModeratorAction({
    actionType: 'seller_stream_ban',
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
  canBanFromSeller: boolean;
  canRemoveKick?: boolean;
  canRemoveRoomBan?: boolean;
  canRemoveSellerBan?: boolean;
  onKickFromShow: () => void;
  onBanFromSeller: () => void;
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
