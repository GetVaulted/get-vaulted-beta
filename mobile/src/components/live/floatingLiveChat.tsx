import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef, useState } from 'react';
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
import { liveChatUsernameInitial } from '../../lib/liveChatAvatar';
import { LIVE_ROOM_TEXT_PROPS } from '../../lib/liveRoomUiScale';
import { MentionComposerInput } from '../mentions/MentionComposerInput';
import { MentionText } from '../mentions/MentionText';
import { LiveRoomText } from './LiveRoomText';
import { LiveChatRowActions } from '../trust/LiveChatRowActions';
import type { LiveModeratorLevel, LiveViewerRole } from '../../api/trustRepository';
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

function chatAvatarUri(message: ChatMessage, hostAvatarUrl: string): string | null {
  const fromMessage = message.senderAvatarUrl?.trim();
  if (fromMessage) return fromMessage;
  if (message.isHost) return hostAvatarUrl?.trim() || null;
  return null;
}

function ChatAvatarBubble({
  message,
  hostAvatarUrl,
  compact,
}: {
  message: ChatMessage;
  hostAvatarUrl: string;
  compact?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const size = compact ? 22 : 24;
  const uri = chatAvatarUri(message, hostAvatarUrl);
  const ringColor = message.isHost ? colors.gold : 'rgba(255,255,255,0.28)';
  const ringWidth = message.isHost ? 1.5 : StyleSheet.hairlineWidth;

  if (uri && !imgFailed) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.chatAvatar,
          { width: size, height: size, borderRadius: size / 2, borderColor: ringColor, borderWidth: ringWidth },
        ]}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        styles.chatAvatarFallback,
        { width: size, height: size, borderRadius: size / 2, borderColor: ringColor, borderWidth: ringWidth },
      ]}
    >
      <Text style={[styles.chatAvatarInitial, { fontSize: compact ? 10 : 11 }]}>
        {liveChatUsernameInitial(message.user)}
      </Text>
    </View>
  );
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
  viewerRole,
  onLongPressMessage,
  onModerationComplete,
  compact,
  onPressMentionUser,
}: {
  message: ChatMessage;
  hostAvatarUrl: string;
  opacity: number;
  liveRoomId?: string;
  hostUserId?: string;
  accessToken?: string;
  canModerate?: boolean;
  viewerRole?: LiveViewerRole;
  onLongPressMessage?: (message: ChatMessage) => void;
  onModerationComplete?: () => void;
  compact?: boolean;
  onPressMentionUser?: (userId: string) => void;
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
  const showBuyerActions =
    !canModerate &&
    message.messageType === 'chat' &&
    liveRoomId &&
    message.senderId &&
    (!hostUserId || message.senderId !== hostUserId);
  const showModLongPress =
    canModerate &&
    (viewerRole === 'host' || viewerRole === 'moderator') &&
    message.messageType === 'chat' &&
    message.senderId &&
    (!hostUserId || message.senderId !== hostUserId);

  return (
    <Pressable
      style={[styles.chatRow, compact && styles.chatRowCompact, { opacity }]}
      onLongPress={showModLongPress ? () => onLongPressMessage?.(message) : undefined}
      delayLongPress={350}
    >
      <ChatAvatarBubble message={message} hostAvatarUrl={hostAvatarUrl} compact={compact} />
      <View style={styles.chatTextWrap}>
        <LiveRoomText style={[styles.inlineLine, compact && styles.inlineLineCompact]} numberOfLines={3}>
          <LiveRoomText style={[styles.username, message.isHost && styles.usernameGold]}>{name}</LiveRoomText>
          {message.isHost ? <LiveRoomText style={styles.hostBadgeInline}> HOST</LiveRoomText> : null}
          <LiveRoomText style={styles.messageBody}> </LiveRoomText>
          <MentionText
            body={message.text}
            mentions={message.mentions}
            style={styles.messageBody}
            onPressUser={onPressMentionUser ? (userId) => onPressMentionUser(userId) : undefined}
          />
        </LiveRoomText>
      </View>
      {showBuyerActions ? (
        <LiveChatRowActions
          liveRoomId={liveRoomId}
          messageId={message.id}
          senderId={message.senderId}
          senderUsername={message.user}
          accessToken={accessToken}
          canModerate={false}
          onComplete={onModerationComplete}
        />
      ) : null}
    </Pressable>
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
  maxRows = MAX_FLOATING_CHAT,
  liveRoomId,
  hostUserId,
  accessToken,
  canModerate,
  viewerRole,
  onLongPressMessage,
  onModerationComplete,
  compact = false,
  onPressMentionUser,
}: {
  pool: ChatMessage[];
  hostAvatarUrl: string;
  bottom: number;
  left: number;
  rightEdge: number;
  isActive: boolean;
  streamKey: string;
  maxHeight?: number;
  maxRows?: number;
  liveRoomId?: string;
  hostUserId?: string;
  accessToken?: string;
  canModerate?: boolean;
  viewerRole?: LiveViewerRole;
  onLongPressMessage?: (message: ChatMessage) => void;
  onModerationComplete?: () => void;
  compact?: boolean;
  onPressMentionUser?: (userId: string) => void;
}) {
  const visible = useMemo(
    () => tailUniqueChatMessages(pool, maxRows),
    [pool, maxRows],
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
            viewerRole={viewerRole}
            onLongPressMessage={onLongPressMessage}
            onModerationComplete={onModerationComplete}
            compact={compact}
            onPressMentionUser={onPressMentionUser}
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
  accessToken,
}: {
  bottom: number;
  left: number;
  rightEdge: number;
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void | Promise<void>;
  sendDisabled?: boolean;
  accessToken?: string;
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
        <MentionComposerInput
          style={styles.composerInput}
          value={value}
          onChangeText={onChangeText}
          accessToken={accessToken}
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
  chatRowCompact: {
    gap: 6,
    marginBottom: 5,
  },
  chatAvatar: {
    flexShrink: 0,
  },
  chatAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  chatAvatarInitial: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '900',
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
  inlineLineCompact: {
    fontSize: 12,
    lineHeight: 15,
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
