import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { applyLiveModerationAction } from '../../api/trustRepository';
import type { LiveModeratorLevel } from '../../api/trustRepository';
import { canPerformModeratorAction, isProtectedShowHost, TIMEOUT_MINUTES } from '../../lib/liveModeratorPermissions';
import { formatChatMessageForCopy } from '../../lib/liveRoomChatMessages';
import { openUserProfile } from '../../navigation/openPlatform';
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
  const openedRef = useRef(false);
  const isHostMessage = isProtectedShowHost({ hostUserId, targetUserId: senderId, messageIsHost });
  const canMod = isModerator || Boolean(canModerate) || Boolean(isHost);
  const copyText = formatChatMessageForCopy(senderUsername, messageText);

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
    if (!visible) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;

    const copyMessage = () => {
      void Clipboard.setStringAsync(copyText).then(() => {
        Alert.alert('Copied', 'Message copied to clipboard.');
        onClose();
      });
    };

    const baseOptions: { label: string; action: () => void; destructive?: boolean }[] = [
      { label: 'Copy message', action: copyMessage },
    ];
    if (senderId) {
      baseOptions.push({
        label: 'View profile',
        action: () => {
          openUserProfile(senderId);
          onClose();
        },
      });
    }
    if (accessToken) {
      baseOptions.push({
        label: 'Report message',
        action: () => setReportOpen(true),
      });
    }

    const options = [...baseOptions, ...modOptions];
    const labels = [...options.map((o) => o.label), 'Cancel'];
    const handlers = [...options.map((o) => o.action), onClose];
    const destructiveIndex = labels.findIndex(
      (l) =>
        l.startsWith('Delete') ||
        l.startsWith('Ban from') ||
        l.startsWith('Kick from'),
    );

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          cancelButtonIndex: labels.length - 1,
          destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
          title: `@${senderUsername.replace(/^@/, '')}`,
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
      `@${senderUsername.replace(/^@/, '')}`,
      undefined,
      [
        ...options.map((opt) => ({
          text: opt.label,
          onPress: opt.action,
          style:
            opt.label.startsWith('Delete') ||
            opt.label.startsWith('Ban from') ||
            opt.label.startsWith('Kick from')
              ? ('destructive' as const)
              : undefined,
        })),
        { text: 'Cancel', style: 'cancel', onPress: onClose },
      ],
      { cancelable: true, onDismiss: onClose },
    );
  }, [accessToken, copyText, modOptions, onClose, senderId, senderUsername, visible]);

  return (
    <ReportSheet
      visible={reportOpen}
      onClose={() => {
        setReportOpen(false);
        onClose();
      }}
      targetType="message"
      targetId={messageId}
      liveRoomId={liveRoomId}
      accessToken={accessToken}
      title="Report message"
    />
  );
}
