import { useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { applyLiveModerationAction } from '../../api/trustRepository';
import type { LiveModeratorLevel } from '../../api/trustRepository';
import { canPerformModeratorAction, isProtectedShowHost, TIMEOUT_MINUTES } from '../../lib/liveModeratorPermissions';
import { openUserProfile } from '../../navigation/openPlatform';
import { colors, radii, spacing } from '../../theme';
import { ReportSheet } from '../trust/ReportSheet';

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
  messageId: string;
  messageText: string;
  senderId?: string;
  senderUsername: string;
  hostUserId?: string;
  messageIsHost?: boolean;
  onComplete?: () => void;
};

function timeoutLabel(minutes: number): string {
  if (minutes >= 24 * 60) return '24 hours';
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour`;
  return `${minutes} min`;
}

export function ModeratorActionSheet(props: Props) {
  const {
    visible,
    onClose,
    liveRoomId,
    accessToken,
    isModerator,
    isHost,
    canModerate,
    moderatorLevel,
    allowedActions,
    messageId,
    messageText,
    senderId,
    senderUsername,
    hostUserId,
    messageIsHost,
    onComplete,
  } = props;

  const [reportOpen, setReportOpen] = useState(false);
  const isHostMessage = isProtectedShowHost({ hostUserId, targetUserId: senderId, messageIsHost });
  const canMod = isModerator || Boolean(canModerate) || Boolean(isHost);

  const runAction = async (actionType: string, metadata?: Record<string, unknown>) => {
    if (!accessToken || !senderId) return;
    const result = await applyLiveModerationAction({
      accessToken,
      roomId: liveRoomId,
      actionType,
      targetUserId: senderId,
      targetMessageId: actionType === 'delete_message' ? messageId : undefined,
      reason: `Moderator action on @${senderUsername}`,
      metadata,
    });
    if (!result.ok) {
      Alert.alert('Moderation', result.error ?? 'Action failed.');
      return;
    }
    onComplete?.();
  };

  const modOptions = useMemo(() => {
    if (!canMod || !accessToken || !senderId || isHostMessage) return [];
    const opts: { label: string; action: () => void; destructive?: boolean }[] = [];
    const can = (actionType: string) =>
      canPerformModeratorAction({ actionType, isModerator, isHost, canModerate, moderatorLevel, allowedActions });

    if (can('delete_message')) {
      opts.push({
        label: 'Delete message',
        destructive: true,
        action: () => void runAction('delete_message'),
      });
    }
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
    if (can('room_ban')) {
      opts.push({
        label: 'Ban from this stream',
        destructive: true,
        action: () => void runAction('room_ban'),
      });
    }
    if (can('seller_stream_ban')) {
      opts.push({
        label: 'Ban from seller future streams',
        destructive: true,
        action: () => void runAction('seller_stream_ban'),
      });
    }
    return opts;
  }, [canMod, accessToken, senderId, isHostMessage, isModerator, isHost, canModerate, moderatorLevel, allowedActions]);

  useEffect(() => {
    if (!visible) return;

    const labels = [
      'View profile',
      'Copy message',
      'Report message',
      ...modOptions.map((o) => o.label),
      'Cancel',
    ];
    const handlers: Array<() => void> = [
      () => {
        if (senderId) openUserProfile(senderId);
      },
      () => {
        void Clipboard.setStringAsync(messageText).then(() => {
          Alert.alert('Copied', 'Message copied to clipboard.');
        });
      },
      () => setReportOpen(true),
      ...modOptions.map((o) => o.action),
      () => undefined,
    ];
    const destructiveIndex = labels.findIndex(
      (l) =>
        l.startsWith('Delete') ||
        l.startsWith('Ban from') ||
        l.startsWith('Kick from'),
    );

    onClose();

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          cancelButtonIndex: labels.length - 1,
          destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
          title: `@${senderUsername}`,
        },
        (idx) => {
          if (idx == null || idx >= handlers.length) return;
          handlers[idx]?.();
        },
      );
      return;
    }

    Alert.alert(
      `@${senderUsername}`,
      undefined,
      [
        ...handlers.slice(0, -1).map((handler, i) => ({
          text: labels[i],
          onPress: handler,
          style:
            labels[i].startsWith('Delete') ||
            labels[i].startsWith('Ban from') ||
            labels[i].startsWith('Kick from')
              ? ('destructive' as const)
              : undefined,
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [visible]);

  return (
    <ReportSheet
      visible={reportOpen}
      onClose={() => setReportOpen(false)}
      targetType="message"
      targetId={messageId}
      liveRoomId={liveRoomId}
      accessToken={accessToken}
      title="Report message"
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingBottom: spacing.lg,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rowText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  destructive: {
    color: '#f87171',
  },
  cancel: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
});
