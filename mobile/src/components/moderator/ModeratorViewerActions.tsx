import { useEffect, useMemo, useRef } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { applyLiveModerationAction } from '../../api/trustRepository';
import type { LiveModeratorLevel } from '../../api/trustRepository';
import { canPerformModeratorAction, isLiveRoomHostUser, TIMEOUT_MINUTES } from '../../lib/liveModeratorPermissions';
import { openUserProfile } from '../../navigation/openPlatform';

type Props = {
  visible: boolean;
  onClose: () => void;
  liveRoomId: string;
  accessToken?: string;
  isModerator: boolean;
  isHost?: boolean;
  canModerate?: boolean;
  moderatorLevel: LiveModeratorLevel | null;
  allowedActions?: string[];
  userId: string;
  username: string;
  hostUserId?: string;
  onComplete?: () => void;
};

function timeoutLabel(minutes: number): string {
  if (minutes >= 24 * 60) return '24 hours';
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour`;
  return `${minutes} min`;
}

export function ModeratorViewerActions({
  visible,
  onClose,
  liveRoomId,
  accessToken,
  isModerator,
  isHost: actorIsHost,
  canModerate,
  moderatorLevel,
  allowedActions,
  userId,
  username,
  hostUserId,
  onComplete,
}: Props) {
  const isHost = isLiveRoomHostUser(hostUserId, userId);
  const openedRef = useRef(false);

  const runAction = async (actionType: string, metadata?: Record<string, unknown>) => {
    if (!accessToken) {
      Alert.alert('Moderation', 'Sign in required to moderate.');
      return;
    }
    const result = await applyLiveModerationAction({
      accessToken,
      roomId: liveRoomId,
      actionType,
      targetUserId: userId,
      reason: `Moderator action on @${username}`,
      metadata,
    });
    if (!result.ok) {
      Alert.alert('Moderation', result.error ?? 'Action failed.');
      return;
    }
    if (actionType === 'kick' || actionType === 'room_ban') {
      Alert.alert('Removed', `@${username} was removed from this show.`);
    } else if (actionType === 'unkick' || actionType === 'unban' || actionType === 'seller_stream_unban') {
      Alert.alert('Restriction lifted', `@${username} can return to this show.`);
    }
    onComplete?.();
  };

  const options = useMemo(() => {
    if (isHost) return [{ label: 'View profile', action: () => openUserProfile(userId) }];
    const opts: { label: string; action: () => void; destructive?: boolean }[] = [
      { label: 'View profile', action: () => openUserProfile(userId) },
    ];
    const can = (actionType: string) =>
      canPerformModeratorAction({
        actionType,
        isModerator,
        isHost: actorIsHost,
        canModerate,
        moderatorLevel,
        allowedActions,
      });

    if (can('timeout')) {
      for (const minutes of TIMEOUT_MINUTES) {
        opts.push({
          label: `Timeout — ${timeoutLabel(minutes)}`,
          action: () => void runAction('timeout', { durationMinutes: minutes }),
        });
      }
    }
    if (can('mute')) opts.push({ label: 'Mute user', action: () => void runAction('mute') });
    if (can('unmute')) opts.push({ label: 'Unmute user', action: () => void runAction('unmute') });
    if (can('block_bidding')) {
      opts.push({ label: 'Block bidding', action: () => void runAction('block_bidding') });
    }
    if (can('unblock_bidding')) {
      opts.push({ label: 'Unblock bidding', action: () => void runAction('unblock_bidding') });
    }
    if (can('kick')) {
      opts.push({ label: 'Kick from stream', destructive: true, action: () => void runAction('kick') });
    }
    if (can('unkick')) {
      opts.push({ label: 'Remove kick', action: () => void runAction('unkick') });
    }
    if (can('room_ban')) {
      opts.push({
        label: 'Ban from stream',
        destructive: true,
        action: () => void runAction('room_ban'),
      });
    }
    if (can('unban')) {
      opts.push({ label: 'Remove room ban', action: () => void runAction('unban') });
    }
    if (can('seller_stream_ban')) {
      opts.push({
        label: 'Ban from seller future streams',
        destructive: true,
        action: () => void runAction('seller_stream_ban'),
      });
    }
    if (can('seller_stream_unban')) {
      opts.push({ label: 'Remove seller stream ban', action: () => void runAction('seller_stream_unban') });
    }
    return opts;
  }, [
    isHost,
    userId,
    username,
    isModerator,
    actorIsHost,
    canModerate,
    moderatorLevel,
    allowedActions,
    accessToken,
    liveRoomId,
    onComplete,
  ]);

  useEffect(() => {
    if (!visible) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;

    const labels = [...options.map((o) => o.label), 'Cancel'];
    const handlers = [...options.map((o) => o.action), onClose];
    const destructiveIndex = labels.findIndex((l) => l.startsWith('Ban') || l.startsWith('Kick'));

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          cancelButtonIndex: labels.length - 1,
          destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
          title: `@${username}`,
        },
        (idx) => {
          if (idx == null || idx >= handlers.length) {
            onClose();
            return;
          }
          handlers[idx]?.();
        },
      );
      return;
    }

    Alert.alert(
      `@${username}`,
      undefined,
      [
        ...options.map((opt, i) => ({
          text: labels[i],
          onPress: opt.action,
          style:
            labels[i].startsWith('Ban') || labels[i].startsWith('Kick')
              ? ('destructive' as const)
              : undefined,
        })),
        { text: 'Cancel', style: 'cancel', onPress: onClose },
      ],
      { cancelable: true, onDismiss: onClose },
    );
  }, [visible, options, onClose, username]);

  return null;
}
