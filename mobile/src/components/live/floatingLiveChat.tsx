import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
  prepareChatMessageHistory,
} from '../../lib/liveRoomChatMessages';
import { liveChatUsernameInitial } from '../../lib/liveChatAvatar';
import { isProtectedShowHost } from '../../lib/liveModeratorPermissions';
import { LIVE_ROOM_TEXT_PROPS } from '../../lib/liveRoomUiScale';
import { MentionComposerInput, type MentionComposerInputHandle } from '../mentions/MentionComposerInput';
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

/** TikTok/Whatnot-style overlay: ~6 visible lines with fade; scroll up for history. */
export const MAX_FLOATING_CHAT = 6;

const ROW_HEIGHT_ESTIMATE = 26;
const ROW_HEIGHT_COMPACT = 22;

const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.85)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;

function chatAvatarUri(message: ChatMessage, hostAvatarUrl?: string | null): string | null {
  const fromMessage = message.senderAvatarUrl?.trim();
  if (fromMessage) return fromMessage;
  if (message.isHost) return hostAvatarUrl?.trim() || null;
  return null;
}

function isModeratorSender(
  message: ChatMessage,
  hostUserId?: string,
  moderatorUserIds?: ReadonlySet<string>,
): boolean {
  if (!message.senderId || !moderatorUserIds?.size || message.isHost) return false;
  if (hostUserId && message.senderId === hostUserId) return false;
  return moderatorUserIds.has(message.senderId);
}

function ChatAvatarBubble({
  message,
  hostAvatarUrl,
  compact,
  isModeratorSender: isMod,
}: {
  message: ChatMessage;
  hostAvatarUrl?: string | null;
  compact?: boolean;
  isModeratorSender?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const size = compact ? 22 : 24;
  const uri = chatAvatarUri(message, hostAvatarUrl);
  const ringColor = message.isHost ? colors.gold : isMod ? colors.mod : 'rgba(255,255,255,0.28)';
  const ringWidth = message.isHost || isMod ? 1.5 : StyleSheet.hairlineWidth;

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

/** Oldest row in the tail window fades; newest stays fully visible. */
function rowOpacity(indexInTail: number, tailSize: number): number {
  if (tailSize <= 1) return 1;
  const progress = indexInTail / (tailSize - 1);
  return 0.14 + progress ** 1.75 * 0.86;
}

function rowOpacityForMessage(
  index: number,
  total: number,
  pinnedToBottom: boolean,
  maxRows: number,
): number {
  if (!pinnedToBottom || total <= 1) return 1;
  const distFromEnd = total - 1 - index;
  if (distFromEnd >= maxRows) return 1;
  const tailSize = Math.min(maxRows, total);
  const indexInTail = tailSize - 1 - distFromEnd;
  return rowOpacity(indexInTail, tailSize);
}

function FloatingChatRow({
  message,
  hostAvatarUrl,
  opacity,
  liveRoomId,
  hostUserId,
  accessToken,
  canModerate,
  isModerator,
  viewerRole,
  onLongPressMessage,
  onModerationComplete,
  compact,
  onPressChatUser,
  moderatorUserIds,
}: {
  message: ChatMessage;
  hostAvatarUrl?: string | null;
  opacity: number;
  liveRoomId?: string;
  hostUserId?: string;
  accessToken?: string;
  canModerate?: boolean;
  isModerator?: boolean;
  viewerRole?: LiveViewerRole;
  onLongPressMessage?: (message: ChatMessage) => void;
  onModerationComplete?: () => void;
  compact?: boolean;
  onPressChatUser?: (user: { username: string; userId?: string }) => void;
  moderatorUserIds?: ReadonlySet<string>;
}) {
  const isModSender = isModeratorSender(message, hostUserId, moderatorUserIds);
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
  const chatUser = { username: message.user, userId: message.senderId };
  const protectedHost = isProtectedShowHost({
    hostUserId,
    targetUserId: message.senderId,
    messageIsHost: message.isHost,
  });
  const showBuyerActions =
    !canModerate &&
    message.messageType === 'chat' &&
    liveRoomId &&
    message.senderId &&
    !protectedHost;
  const showModLongPress =
    Boolean(isModerator) &&
    message.messageType === 'chat' &&
    message.senderId &&
    !protectedHost;

  return (
    <Pressable
      style={[styles.chatRow, compact && styles.chatRowCompact, { opacity }]}
      onLongPress={showModLongPress ? () => onLongPressMessage?.(message) : undefined}
      delayLongPress={350}
    >
      <ChatAvatarBubble
        message={message}
        hostAvatarUrl={hostAvatarUrl}
        compact={compact}
        isModeratorSender={isModSender}
      />
      <View style={styles.chatTextWrap}>
        <LiveRoomText style={[styles.inlineLine, compact && styles.inlineLineCompact]} numberOfLines={3}>
          <LiveRoomText
            style={[
              styles.username,
              message.isHost && styles.usernameGold,
              isModSender && styles.usernameMod,
            ]}
            onPress={onPressChatUser ? () => onPressChatUser(chatUser) : undefined}
          >
            {name}
          </LiveRoomText>
          {message.isHost ? <LiveRoomText style={styles.hostBadgeInline}> HOST</LiveRoomText> : null}
          {isModSender ? <LiveRoomText style={styles.modBadgeInline}> MOD</LiveRoomText> : null}
          <LiveRoomText style={styles.messageBody}> </LiveRoomText>
          <MentionText
            body={message.text}
            mentions={message.mentions}
            style={styles.messageBody}
            onPressUser={
              onPressChatUser
                ? (userId, username) => onPressChatUser({ userId: userId || undefined, username })
                : undefined
            }
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
  isModerator,
  viewerRole,
  onLongPressMessage,
  onModerationComplete,
  compact = false,
  onPressChatUser,
  moderatorUserIds,
}: {
  pool: ChatMessage[];
  hostAvatarUrl?: string | null;
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
  isModerator?: boolean;
  viewerRole?: LiveViewerRole;
  onLongPressMessage?: (message: ChatMessage) => void;
  onModerationComplete?: () => void;
  compact?: boolean;
  onPressChatUser?: (user: { username: string; userId?: string }) => void;
  moderatorUserIds?: string[];
}) {
  const history = useMemo(() => prepareChatMessageHistory(pool), [pool]);
  const moderatorIdSet = useMemo(() => new Set(moderatorUserIds ?? []), [moderatorUserIds]);
  const scrollRef = useRef<ScrollView>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  const rowHeight = compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_ESTIMATE;
  const viewportHeight = Math.min(maxHeight, maxRows * rowHeight + 12);

  useEffect(() => {
    if (!isActive || !pinnedToBottom) return;
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [history.length, isActive, pinnedToBottom, streamKey]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setPinnedToBottom(distFromBottom < 32);
  };

  if (!isActive || history.length === 0) return null;

  return (
    <View
      style={[styles.floatChatColumn, { bottom, left, right: rightEdge, maxHeight: viewportHeight }]}
      pointerEvents="box-none"
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scrollViewport}
        contentContainerStyle={styles.stackInner}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {history.map((m, idx) => (
          <FloatingChatRow
            key={`${streamKey}-${m.id}`}
            message={m}
            hostAvatarUrl={hostAvatarUrl}
            opacity={rowOpacityForMessage(idx, history.length, pinnedToBottom, maxRows)}
            liveRoomId={liveRoomId}
            hostUserId={hostUserId}
            accessToken={accessToken}
            canModerate={canModerate}
            isModerator={isModerator}
            viewerRole={viewerRole}
            onLongPressMessage={onLongPressMessage}
            onModerationComplete={onModerationComplete}
            compact={compact}
            onPressChatUser={onPressChatUser}
            moderatorUserIds={moderatorIdSet}
          />
        ))}
      </ScrollView>
      {pinnedToBottom && history.length >= 4 ? (
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
  inputDisabled,
  accessToken,
  leadingAccessory,
  placeholder = COMPOSER_PLACEHOLDER,
  inputRef,
}: {
  bottom: number;
  left: number;
  rightEdge: number;
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void | Promise<void>;
  sendDisabled?: boolean;
  /** When true, blocks focus/typing only (send can still be gated separately). */
  inputDisabled?: boolean;
  accessToken?: string;
  leadingAccessory?: ReactNode;
  placeholder?: string;
  inputRef?: RefObject<MentionComposerInputHandle | null>;
}) {
  const submitLockRef = useRef(false);
  const localInputRef = useRef<MentionComposerInputHandle>(null);
  const composerRef = inputRef ?? localInputRef;
  const canSend = !sendDisabled && value.trim().length > 0;
  const editable = !inputDisabled;

  const handleSend = async () => {
    if (submitLockRef.current || sendDisabled || !value.trim()) return;
    composerRef.current?.dismissSuggestions();
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
      {leadingAccessory}
      <View style={[styles.composerPill, leadingAccessory ? styles.composerPillWithLeading : null]}>
        <MentionComposerInput
          ref={composerRef}
          style={styles.composerInput}
          value={value}
          onChangeText={onChangeText}
          accessToken={accessToken}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.48)"
          returnKeyType="send"
          enablesReturnKeyAutomatically
          blurOnSubmit={false}
          onSubmitEditing={() => void handleSend()}
          editable={editable}
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
  scrollViewport: {
    width: '100%',
    flexGrow: 0,
  },
  stackInner: {
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingTop: 4,
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
  usernameMod: {
    color: colors.mod,
  },
  hostBadgeInline: {
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.gold,
  },
  modBadgeInline: {
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.mod,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 20,
    elevation: 20,
  },
  composerPill: {
    flex: 1,
    minWidth: 0,
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
  composerPillWithLeading: {
    flex: 1,
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
