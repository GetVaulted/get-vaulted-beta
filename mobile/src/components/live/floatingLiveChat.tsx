import { Ionicons } from '@expo/vector-icons';
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
import type { ChatMessage } from '../../types';

/** @deprecated Use COMPOSER_BAR_HEIGHT from liveRoomBottomLayout */
export const COMPOSER_BAR_H = COMPOSER_BAR_HEIGHT;
/** @deprecated Use CHAT_ABOVE_COMPOSER_GAP from liveRoomBottomLayout */
export const CHAT_ZONE_GAP = CHAT_ABOVE_COMPOSER_GAP;
export const CHAT_STACK_RESERVE = 248;

const COMPOSER_PLACEHOLDER = 'Say something';

const MAX_FLOATING_CHAT = 10;

const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.85)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;

function chatAvatarUri(message: ChatMessage, hostAvatarUrl: string) {
  if (message.isHost) return hostAvatarUrl;
  return `https://i.pravatar.cc/80?u=${encodeURIComponent(message.user)}`;
}

function rowOpacity(index: number, total: number): number {
  if (total <= 1) return 1;
  return 0.34 + (index / (total - 1)) * 0.66;
}

function FloatingChatRow({
  message,
  hostAvatarUrl,
  opacity,
}: {
  message: ChatMessage;
  hostAvatarUrl: string;
  opacity: number;
}) {
  if (isViewerEventMessage(message)) {
    const name = formatViewerEventName(message.user);
    return (
      <View style={[styles.eventRow, { opacity }]}>
        <Text style={styles.eventText} numberOfLines={2}>
          <Text style={[styles.eventName, message.isHost && styles.usernameHost]}>{name}</Text>
          <Text style={styles.eventAction}> {message.text}</Text>
        </Text>
      </View>
    );
  }

  const name = formatChatDisplayName(message.user, message.isHost);
  return (
    <View style={[styles.chatRow, { opacity }]}>
      <Image source={{ uri: chatAvatarUri(message, hostAvatarUrl) }} style={styles.chatAvatar} />
      <View style={styles.chatTextCol}>
        <Text style={[styles.username, message.isHost && styles.usernameHost]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.messageText} numberOfLines={3}>
          {message.text}
        </Text>
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
}: {
  pool: ChatMessage[];
  hostAvatarUrl: string;
  bottom: number;
  left: number;
  rightEdge: number;
  isActive: boolean;
  streamKey: string;
  maxHeight?: number;
}) {
  const visible = useMemo(
    () => tailUniqueChatMessages(pool, MAX_FLOATING_CHAT),
    [pool],
  );

  if (!isActive || visible.length === 0) return null;

  return (
    <View
      style={[styles.floatChatColumn, { bottom, left, right: rightEdge, maxHeight }]}
      pointerEvents="none"
    >
      {visible.map((m, idx) => (
        <FloatingChatRow
          key={`${streamKey}-${m.id}`}
          message={m}
          hostAvatarUrl={hostAvatarUrl}
          opacity={rowOpacity(idx, visible.length)}
        />
      ))}
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
    zIndex: 14,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
    maxWidth: '100%',
  },
  chatAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    marginTop: 1,
  },
  chatTextCol: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  username: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.96)',
    letterSpacing: -0.15,
    marginBottom: 1,
    ...TEXT_SHADOW,
  },
  usernameHost: {
    color: colors.gold,
  },
  messageText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 17,
    ...TEXT_SHADOW,
  },
  eventRow: {
    marginBottom: 8,
    maxWidth: '100%',
  },
  eventText: {
    fontSize: 13,
    lineHeight: 17,
    ...TEXT_SHADOW,
  },
  eventName: {
    fontWeight: '800',
    color: 'rgba(255,255,255,0.96)',
  },
  eventAction: {
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
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
