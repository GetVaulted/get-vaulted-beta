import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet } from 'react-native';
import { applyLiveModerationAction } from '../../api/trustRepository';
import { isLiveRoomHostUser } from '../../lib/liveModeratorPermissions';
import { radii, spacing } from '../../theme';
import { ReportSheet } from './ReportSheet';

type Props = {
  liveRoomId: string;
  messageId: string;
  senderId?: string;
  senderUsername: string;
  hostUserId?: string;
  accessToken?: string;
  canModerate?: boolean;
  onComplete?: () => void;
};

export function LiveChatRowActions({
  liveRoomId,
  messageId,
  senderId,
  senderUsername,
  hostUserId,
  accessToken,
  canModerate = false,
  onComplete,
}: Props) {
  const [reportOpen, setReportOpen] = useState(false);
  const hostProtected = isLiveRoomHostUser(hostUserId, senderId);

  const runMod = async (actionType: string) => {
    if (!accessToken || !senderId || hostProtected) return;
    const result = await applyLiveModerationAction({
      accessToken,
      roomId: liveRoomId,
      actionType,
      targetUserId: senderId,
      targetMessageId: actionType === 'delete_message' ? messageId : undefined,
      reason: `Moderator action on @${senderUsername}`,
    });
    if (!result.ok) {
      Alert.alert('Moderation', result.error ?? 'Action failed.');
      return;
    }
    onComplete?.();
  };

  const openMenu = () => {
    const options: string[] = ['Report message'];
    const handlers: Array<() => void> = [() => setReportOpen(true)];

    if (canModerate && accessToken && senderId && !hostProtected) {
      options.push(
        'Mute',
        'Kick',
        'Ban from room',
        'Block bidding',
        'Remove kick',
        'Remove room ban',
        'Unmute',
        'Unblock bidding',
        'Delete message',
      );
      handlers.push(
        () => void runMod('mute'),
        () => void runMod('kick'),
        () => void runMod('room_ban'),
        () => void runMod('block_bidding'),
        () => void runMod('unkick'),
        () => void runMod('unban'),
        () => void runMod('unmute'),
        () => void runMod('unblock_bidding'),
        () => void runMod('delete_message'),
      );
    }
    options.push('Cancel');
    handlers.push(() => undefined);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: canModerate ? options.indexOf('Delete message') : undefined,
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
          text: options[i],
          onPress: handler,
          style: options[i] === 'Delete message' ? ('destructive' as const) : undefined,
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return (
    <>
      <Pressable onPress={openMenu} hitSlop={8} style={styles.trigger} accessibilityLabel="Chat actions">
        <Ionicons name="ellipsis-horizontal" size={14} color="rgba(255,255,255,0.55)" />
      </Pressable>
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="message"
        targetId={messageId}
        liveRoomId={liveRoomId}
        accessToken={accessToken}
        title="Report message"
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    marginLeft: spacing.xs,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
