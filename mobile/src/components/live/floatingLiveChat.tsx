import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  isHostEndingLiveBody,
  isViewerEventMessage,
  prepareChatMessageHistory,
} from '../../lib/liveRoomChatMessages';
import { liveChatUsernameInitial } from '../../lib/liveChatAvatar';
import { isProtectedShowHost } from '../../lib/liveModeratorPermissions';
import { LIVE_ROOM_TEXT_PROPS } from '../../lib/liveRoomUiScale';
import { scaledComposerBarHeight } from '../../lib/liveRoomBottomLayout';
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

/** TikTok/Whatnot-style overlay: ~6 lines visible; scroll up for full session history. */
export const MAX_FLOATING_CHAT = 6;
export const MAX_FLOATING_CHAT_EXPANDED = 14;
export const FLOATING_CHAT_SCROLL_NEAR_BOTTOM_PX = 48;

/** Whatnot-style pinned mod row (avatar + username + Mod pill + body). */
export type PinnedModeratorChat = {
  body: string;
  username: string;
  avatarUrl?: string | null;
  isHost?: boolean;
};

export const PINNED_MODERATOR_ROW_HEIGHT = 62;

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
  overlayScale = 1,
}: {
  message: ChatMessage;
  hostAvatarUrl?: string | null;
  compact?: boolean;
  isModeratorSender?: boolean;
  overlayScale?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const scale = overlayScale > 1 ? overlayScale : 1;
  const size = Math.round((compact ? 22 : 24) * scale);
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
      <Text style={[styles.chatAvatarInitial, { fontSize: Math.round((compact ? 10 : 11) * scale) }]}>
        {liveChatUsernameInitial(message.user)}
      </Text>
    </View>
  );
}

function FloatingChatRow({
  message,
  hostAvatarUrl,
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
  overlayScale = 1,
}: {
  message: ChatMessage;
  hostAvatarUrl?: string | null;
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
  overlayScale?: number;
}) {
  const scale = overlayScale > 1 ? overlayScale : 1;
  const isModSender = isModeratorSender(message, hostUserId, moderatorUserIds);
  const isHostEnding = isHostEndingLiveBody(message.text);
  const isEvent = isViewerEventMessage(message);
  const name = isEvent ? formatViewerEventName(message.user) : formatChatDisplayName(message.user);
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
    Boolean(isModerator || canModerate) &&
    message.messageType === 'chat' &&
    message.senderId &&
    !protectedHost;

  return (
    <Pressable
      style={[styles.chatRow, compact && styles.chatRowCompact, isHostEnding && styles.lifecycleRow]}
      onLongPress={showModLongPress ? () => onLongPressMessage?.(message) : undefined}
      delayLongPress={350}
    >
      {isHostEnding ? (
        <LiveRoomText
          style={[
            styles.lifecycleEvent,
            scale > 1 && { fontSize: Math.round(13 * scale), lineHeight: Math.round(17 * scale) },
          ]}
        >
          {message.text}
        </LiveRoomText>
      ) : (
        <>
      <ChatAvatarBubble
        message={message}
        hostAvatarUrl={hostAvatarUrl}
        compact={compact}
        isModeratorSender={isModSender}
        overlayScale={scale}
      />
      <View style={styles.chatTextWrap}>
        <LiveRoomText
          style={[
            styles.inlineLine,
            compact && styles.inlineLineCompact,
            scale > 1 && {
              fontSize: Math.round((compact ? 12 : 13) * scale),
              lineHeight: Math.round((compact ? 15 : 17) * scale),
            },
          ]}
          numberOfLines={3}
        >
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
          {isEvent ? (
            <LiveRoomText style={styles.messageBody}> {message.text}</LiveRoomText>
          ) : (
            <>
              <LiveRoomText style={styles.messageSep}>: </LiveRoomText>
              <MentionText
                inline
                body={message.text}
                mentions={message.mentions}
                style={styles.messageBody}
                mentionStyle={styles.messageMention}
                onPressUser={
                  onPressChatUser
                    ? (userId, username) => onPressChatUser({ userId: userId || undefined, username })
                    : undefined
                }
              />
            </>
          )}
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
        </>
      )}
    </Pressable>
  );
}

export function PinnedModeratorBar({
  pinned,
  compact,
  overlayScale = 1,
}: {
  pinned: PinnedModeratorChat;
  compact?: boolean;
  overlayScale?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const scale = overlayScale > 1 ? overlayScale : 1;
  const size = Math.round((compact ? 22 : 24) * scale);
  const uri = pinned.avatarUrl?.trim() || null;
  const username = pinned.username.trim();
  const isHost = Boolean(pinned.isHost);
  const ringColor = isHost ? colors.gold : colors.mod;
  const ringWidth = 1.5;

  return (
    <View style={styles.pinnedRowShell} pointerEvents="none">
      <View style={[styles.pinnedRowInner, compact && styles.pinnedRowInnerCompact]}>
        {uri && !imgFailed ? (
          <Image
            source={{ uri }}
            style={[
              styles.chatAvatar,
              { width: size, height: size, borderRadius: size / 2, borderColor: ringColor, borderWidth: ringWidth },
            ]}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View
            style={[
              styles.chatAvatarFallback,
              { width: size, height: size, borderRadius: size / 2, borderColor: ringColor, borderWidth: ringWidth },
            ]}
          >
            <Text style={[styles.chatAvatarInitial, { fontSize: Math.round((compact ? 10 : 11) * scale) }]}>
              {username ? liveChatUsernameInitial(username) : isHost ? 'H' : 'M'}
            </Text>
          </View>
        )}
        <View style={styles.pinnedTextWrap}>
          <View style={styles.pinnedMetaRow}>
            {username ? (
              <LiveRoomText
                style={[styles.pinnedUsername, isHost ? styles.usernameGold : styles.usernameMod]}
              >
                {username}
              </LiveRoomText>
            ) : null}
            {isHost ? (
              <View style={styles.pinnedHostPill}>
                <LiveRoomText style={styles.pinnedHostPillText}>Host</LiveRoomText>
              </View>
            ) : (
              <View style={styles.pinnedModPill}>
                <LiveRoomText style={styles.pinnedModPillText}>Mod</LiveRoomText>
              </View>
            )}
          </View>
          <LiveRoomText
            style={[
              styles.pinnedBody,
              compact && styles.inlineLineCompact,
              scale > 1 && { fontSize: Math.round(13 * scale), lineHeight: Math.round(17 * scale) },
            ]}
            numberOfLines={2}
          >
            {pinned.body.trim()}
          </LiveRoomText>
        </View>
      </View>
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
  overlayScale = 1,
  expanded = false,
  onToggleExpanded,
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
  overlayScale?: number;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const history = useMemo(() => prepareChatMessageHistory(pool), [pool]);
  const moderatorIdSet = useMemo(() => new Set(moderatorUserIds ?? []), [moderatorUserIds]);
  const scrollRef = useRef<ScrollView>(null);
  const pinnedToBottomRef = useRef(true);
  const lastMessageId = history[history.length - 1]?.id;
  const scale = overlayScale > 1 ? overlayScale : 1;

  const rowHeight = compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_ESTIMATE;
  const visibleRowCap = expanded ? MAX_FLOATING_CHAT_EXPANDED : maxRows;
  const viewportHeight = Math.min(maxHeight, visibleRowCap * rowHeight + 12);
  const scrollMaxHeight = Math.max(48, viewportHeight);

  const scrollToBottom = () => {
    scrollRef.current?.scrollToEnd({ animated: false });
  };

  useEffect(() => {
    if (!lastMessageId || !pinnedToBottomRef.current) return;
    const frame = requestAnimationFrame(() => {
      scrollToBottom();
      requestAnimationFrame(scrollToBottom);
    });
    return () => cancelAnimationFrame(frame);
  }, [lastMessageId, streamKey]);

  useEffect(() => {
    if (!pinnedToBottomRef.current) return;
    const frame = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(frame);
  }, [expanded, scrollMaxHeight]);

  if (!isActive) return null;

  const hasChat = history.length > 0;
  if (!hasChat) return null;

  return (
    <View
      style={[styles.floatChatColumn, { bottom, left, right: rightEdge }]}
      pointerEvents="box-none"
    >
      <ScrollView
        ref={scrollRef}
        style={[styles.scrollViewport, { height: scrollMaxHeight }]}
        contentContainerStyle={[styles.stackBottomAnchored, { minHeight: scrollMaxHeight }]}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const distFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
          pinnedToBottomRef.current = distFromBottom < FLOATING_CHAT_SCROLL_NEAR_BOTTOM_PX;
        }}
        onContentSizeChange={() => {
          if (pinnedToBottomRef.current) scrollToBottom();
        }}
        onLayout={() => {
          if (pinnedToBottomRef.current) scrollToBottom();
        }}
      >
        {history.map((m) => (
          <FloatingChatRow
            key={`${streamKey}-${m.id}`}
            message={m}
            hostAvatarUrl={hostAvatarUrl}
            liveRoomId={liveRoomId}
            hostUserId={hostUserId}
            accessToken={accessToken}
            canModerate={canModerate}
            isModerator={isModerator}
            viewerRole={viewerRole}
            onLongPressMessage={onLongPressMessage}
            onModerationComplete={onModerationComplete}
            compact={compact}
            overlayScale={scale}
            onPressChatUser={onPressChatUser}
            moderatorUserIds={moderatorIdSet}
          />
        ))}
      </ScrollView>
      {onToggleExpanded ? (
        <Pressable
          style={[styles.chatExpandToggle, scale > 1 && { paddingHorizontal: Math.round(10 * scale) }]}
          onPress={onToggleExpanded}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse chat' : 'Expand chat'}
        >
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-up'}
            size={Math.round(16 * scale)}
            color="rgba(255,255,255,0.92)"
          />
        </Pressable>
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
  liveRoomId,
  leadingAccessory,
  placeholder = COMPOSER_PLACEHOLDER,
  inputRef,
  overlayScale = 1,
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
  liveRoomId?: string;
  leadingAccessory?: ReactNode;
  placeholder?: string;
  inputRef?: RefObject<MentionComposerInputHandle | null>;
  overlayScale?: number;
}) {
  const scale = overlayScale > 1 ? overlayScale : 1;
  const barHeight = scaledComposerBarHeight(scale);
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
      style={[styles.composerWrap, { bottom, left, right: rightEdge, height: barHeight }]}
      pointerEvents="box-none"
    >
      {leadingAccessory}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        scrollEnabled={false}
        style={styles.composerScroll}
        contentContainerStyle={styles.composerPillFlex}
      >
        <View
          style={[
            styles.composerPill,
            leadingAccessory ? styles.composerPillWithLeading : null,
            scale > 1 && { minHeight: barHeight - 4, paddingLeft: Math.round(spacing.md * scale) },
          ]}
        >
          <MentionComposerInput
            ref={composerRef}
            style={[styles.composerInput, scale > 1 && { fontSize: Math.round(14 * scale) }]}
            value={value}
            onChangeText={onChangeText}
            accessToken={accessToken}
            liveRoomId={liveRoomId}
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
              size={Math.round(16 * scale)}
              color={canSend ? colors.gold : 'rgba(255,255,255,0.28)'}
            />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  floatChatColumn: {
    position: 'absolute',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    zIndex: 18,
    elevation: 18,
  },
  pinnedRowShell: {
    width: '100%',
    marginTop: 6,
  },
  pinnedRowInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  pinnedRowInnerCompact: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  pinnedTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  pinnedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  pinnedInlineLine: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 17,
    ...TEXT_SHADOW,
  },
  pinnedUsername: {
    fontWeight: '800',
    fontSize: 13,
    color: 'rgba(255,255,255,0.96)',
    ...TEXT_SHADOW,
  },
  pinnedModPill: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(113,113,122,0.92)',
  },
  pinnedModPillText: {
    fontWeight: '700',
    fontSize: 10,
    color: '#fff',
    letterSpacing: 0.2,
  },
  pinnedHostPill: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(212, 175, 55, 0.28)',
  },
  pinnedHostPillText: {
    fontWeight: '700',
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 0.2,
  },
  pinnedBody: {
    fontWeight: '500',
    fontSize: 13,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.94)',
    ...TEXT_SHADOW,
  },
  chatExpandToggle: {
    alignSelf: 'flex-end',
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  scrollViewport: {
    width: '100%',
  },
  stackBottomAnchored: {
    width: '100%',
    flexGrow: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingBottom: 4,
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
  lifecycleRow: {
    justifyContent: 'center',
    paddingVertical: 2,
  },
  lifecycleEvent: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 17,
    ...TEXT_SHADOW,
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
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.94)',
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
    fontWeight: '600',
    color: '#FFFFFF',
    ...TEXT_SHADOW,
  },
  messageMention: {
    color: colors.mention,
    fontWeight: '800',
  },
  messageSep: {
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
  },
  composerWrap: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 20,
    elevation: 20,
  },
  composerScroll: {
    flex: 1,
    minWidth: 0,
  },
  composerPillFlex: {
    flexGrow: 1,
    width: '100%',
  },
  composerPill: {
    width: '100%',
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
