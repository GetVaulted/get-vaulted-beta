import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radii, spacing } from '../../theme';
import {
  COMPOSER_BAR_HEIGHT,
  CHAT_ABOVE_COMPOSER_GAP,
} from '../../lib/liveRoomBottomLayout';
import {
  formatChatDisplayName,
  formatViewerEventName,
  isViewerEventMessage,
  tailUniqueChatMessages,
} from '../../lib/liveRoomChatMessages';
import { LIVE_ROOM_TEXT_PROPS } from '../../lib/liveRoomUiScale';
import { LiveRoomText } from './LiveRoomText';
import { LiveChatRowActions } from '../trust/LiveChatRowActions';
import type { ChatMessage } from '../../types';

/** @deprecated Use COMPOSER_BAR_HEIGHT from liveRoomBottomLayout */
export const COMPOSER_BAR_H = COMPOSER_BAR_HEIGHT;
/** @deprecated Use CHAT_ABOVE_COMPOSER_GAP from liveRoomBottomLayout */
export const CHAT_ZONE_GAP = CHAT_ABOVE_COMPOSER_GAP;
export const CHAT_STACK_RESERVE = 248;

const COMPOSER_PLACEHOLDER = 'Say something';

/** TikTok/Whatnot-style overlay: last N lines, oldest fade at top. */
export const MAX_FLOATING_CHAT = 5;

const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.85)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;

function chatAvatarUri(message: ChatMessage, hostAvatarUrl: string) {
  if (message.isHost) return hostAvatarUrl;
  return `https://i.pravatar.cc/80?u=${encodeURIComponent(message.user)}`;
}

/** Oldest row (top) fades out; newest (bottom) stays fully visible. */
function rowOpacity(index: number, total: number): number {
  if (total <= 1) return 1;
  const progress = index / (total - 1);
  return 0.14 + progress ** 1.75 * 0.86;
}

function FloatingChatRow({
  message,
  hostAvatarUrl,
  opacity,
  liveRoomId,
  hostUserId,
  accessToken,
  canModerate,
  onModerationComplete,
}: {
  message: ChatMessage;
  hostAvatarUrl: string;
  opacity: number;
  liveRoomId?: string;
  hostUserId?: string;
  accessToken?: string;
  canModerate?: boolean;
  onModerationComplete?: () => void;
}) {
  if (isViewerEventMessage(message)) {
    const name = formatViewerEventName(message.user);
    return (
      <View style={[styles.eventRow, { opacity }]}>
        <LiveRoomText style={styles.inlineLine} numberOfLines={2}>
          <LiveRoomText style={[styles.username, message.isHost && styles.usernameGold]}>{name}</LiveRoomText>
          <LiveRoomText style={styles.messageBody}> {message.text}</LiveRoomText>
        </LiveRoomText>
      </View>
    );
  }

  const name = formatChatDisplayName(message.user);
  const showActions =
    message.messageType === 'chat' &&
    liveRoomId &&
    message.senderId &&
    (!hostUserId || message.senderId !== hostUserId);

  return (
    <View style={[styles.chatRow, { opacity }]}>
      <Image source={{ uri: chatAvatarUri(message, hostAvatarUrl) }} style={styles.chatAvatar} />
      <View style={styles.chatTextWrap}>
        <LiveRoomText style={styles.inlineLine} numberOfLines={3}>
          <LiveRoomText style={[styles.username, message.isHost && styles.usernameGold]}>{name}</LiveRoomText>
          {message.isHost ? <LiveRoomText style={styles.hostBadgeInline}> HOST</LiveRoomText> : null}
          <LiveRoomText style={styles.messageBody}> {message.text}</LiveRoomText>
        </LiveRoomText>
      </View>
      {showActions ? (
        <LiveChatRowActions
          liveRoomId={liveRoomId}
          messageId={message.id}
          senderId={message.senderId}
          senderUsername={message.user}
          accessToken={accessToken}
          canModerate={canModerate}
          onComplete={onModerationComplete}
        />
      ) : null}
    </View>
  );
}

export function FloatingLiveChat({
  pool,
  hostAvatarUrl,
  bottom,
  left,
  rightEdge,
  isActive,
  streamKey,
  maxHeight = CHAT_STACK_RESERVE,
  liveRoomId,
  hostUserId,
  accessToken,
  canModerate,
  onModerationComplete,
}: {
  pool: ChatMessage[];
  hostAvatarUrl: string;
  bottom: number;
  left: number;
  rightEdge: number;
  isActive: boolean;
  streamKey: string;
  maxHeight?: number;
  liveRoomId?: string;
  hostUserId?: string;
  accessToken?: string;
  canModerate?: boolean;
  onModerationComplete?: () => void;
}) {
  const visible = useMemo(
    () => tailUniqueChatMessages(pool, MAX_FLOATING_CHAT),
    [pool],
  );

  if (!isActive || visible.length === 0) return null;

  return (
    <View
      style={[styles.floatChatColumn, { bottom, left, right: rightEdge, maxHeight }]}
      pointerEvents="box-none"
    >
      <View style={styles.stackInner} pointerEvents="box-none">
        {visible.map((m, idx) => (
          <FloatingChatRow
            key={`${streamKey}-${m.id}`}
            message={m}
            hostAvatarUrl={hostAvatarUrl}
            opacity={rowOpacity(idx, visible.length)}
            liveRoomId={liveRoomId}
            hostUserId={hostUserId}
            accessToken={accessToken}
            canModerate={canModerate}
            onModerationComplete={onModerationComplete}
          />
        ))}
      </View>
      {visible.length >= 3 ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.18)', 'transparent']}
          locations={[0, 0.42, 0.72]}
          style={styles.topFadeMask}
        />
      ) : null}
    </View>
  );
}

export function FloatingChatComposer({
  bottom,
  left,
  rightEdge,
  value,
  onChangeText,
  onSend,
  sendDisabled,
}: {
  bottom: number;
  left: number;
  rightEdge: number;
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void | Promise<void>;
  sendDisabled?: boolean;
}) {
  const submitLockRef = useRef(false);
  const canSend = !sendDisabled && value.trim().length > 0;

  const handleSend = async () => {
    if (submitLockRef.current || sendDisabled || !value.trim()) return;
    submitLockRef.current = true;
    try {
      await onSend();
    } finally {
      submitLockRef.current = false;
    }
  };

  return (
    <View
      style={[styles.composerWrap, { bottom, left, right: rightEdge, height: COMPOSER_BAR_HEIGHT }]}
      pointerEvents="box-none"
    >
      <View style={styles.composerPill}>
        <TextInput
          style={styles.composerInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={COMPOSER_PLACEHOLDER}
          placeholderTextColor="rgba(255,255,255,0.48)"
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={() => void handleSend()}
          editable={!sendDisabled}
          maxLength={280}
          allowFontScaling={LIVE_ROOM_TEXT_PROPS.allowFontScaling}
          maxFontSizeMultiplier={LIVE_ROOM_TEXT_PROPS.maxFontSizeMultiplier}
        />
        <Pressable
          style={[styles.composerSendBtn, !canSend && styles.composerSendBtnDim]}
          onPress={() => void handleSend()}
          hitSlop={8}
          disabled={!canSend}
        >
          <Ionicons
            name="send"
            size={16}
            color={canSend ? colors.gold : 'rgba(255,255,255,0.28)'}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatChatColumn: {
    position: 'absolute',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    overflow: 'hidden',
    zIndex: 14,
  },
  stackInner: {
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  topFadeMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '62%',
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 7,
    maxWidth: '100%',
  },
  chatAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    flexShrink: 0,
  },
  chatTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  inlineLine: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 17,
    ...TEXT_SHADOW,
  },
  username: {
    fontWeight: '800',
    color: 'rgba(255,255,255,0.96)',
  },
  usernameGold: {
    color: colors.gold,
  },
  hostBadgeInline: {
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.gold,
  },
  messageBody: {
    fontWeight: '500',
    color: 'rgba(255,255,255,0.92)',
  },
  eventRow: {
    marginBottom: 6,
    maxWidth: '100%',
  },
  composerWrap: {
    position: 'absolute',
    zIndex: 15,
  },
  composerPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingLeft: spacing.md,
    paddingRight: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  composerInput: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(255,255,255,0.94)',
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: Platform.OS === 'ios' ? 10 : 7,
    paddingRight: 6,
  },
  composerSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  composerSendBtnDim: {
    opacity: 0.45,
  },
});
