import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { tailUniqueChatMessages } from '../../lib/liveRoomChatMessages';
import type { ChatMessage } from '../../types';

/** @deprecated Use COMPOSER_BAR_HEIGHT from liveRoomBottomLayout */
export const COMPOSER_BAR_H = COMPOSER_BAR_HEIGHT;
/** @deprecated Use CHAT_ABOVE_COMPOSER_GAP from liveRoomBottomLayout */
export const CHAT_ZONE_GAP = CHAT_ABOVE_COMPOSER_GAP;
export const CHAT_STACK_RESERVE = 232;

const COMPOSER_PLACEHOLDERS = [
  'Say something…',
  'Join the conversation…',
  'Chat with the room…',
] as const;

const COMPOSER_QUICK_REACTIONS = ['❤️', '🔥', '👏'] as const;

const MAX_FLOATING_CHAT = 8;

function chatAvatarUri(message: ChatMessage, hostAvatarUrl: string) {
  if (message.isHost) return hostAvatarUrl;
  return `https://i.pravatar.cc/80?u=${encodeURIComponent(message.user)}`;
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
      {visible.map((m) => {
        const name = m.isHost ? 'HOST' : m.user;
        return (
          <View key={`${streamKey}-${m.id}`} style={styles.floatChatRow}>
            <Image source={{ uri: chatAvatarUri(m, hostAvatarUrl) }} style={styles.chatAvatarTiny} />
            <Text style={styles.floatChatTextBlock} numberOfLines={2}>
              <Text style={[styles.chatNameInline, m.isHost && styles.chatNameHost]}>{name}: </Text>
              <Text style={styles.chatMsgInline}>{m.text}</Text>
            </Text>
          </View>
        );
      })}
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
  placeholderIndex,
  onQuickReaction,
  onEmojiPress,
}: {
  bottom: number;
  left: number;
  rightEdge: number;
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  sendDisabled?: boolean;
  placeholderIndex: number;
  onQuickReaction: (emoji: string) => void;
  onEmojiPress: () => void;
}) {
  const submitLockRef = useRef(false);
  const canSend = !sendDisabled && value.trim().length > 0;
  const placeholder = COMPOSER_PLACEHOLDERS[placeholderIndex % COMPOSER_PLACEHOLDERS.length];

  const handleSend = () => {
    if (submitLockRef.current || sendDisabled || !value.trim()) return;
    submitLockRef.current = true;
    onSend();
    setTimeout(() => {
      submitLockRef.current = false;
    }, 750);
  };

  return (
    <View
      style={[styles.composerWrap, { bottom, left, right: rightEdge, height: COMPOSER_BAR_HEIGHT }]}
      pointerEvents="box-none"
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.composerAndroidUnderlay]} />
      )}
      <View style={styles.composerTint} pointerEvents="none" />
      <View style={styles.composerInner}>
        <View style={styles.composerQuickInline}>
          {COMPOSER_QUICK_REACTIONS.map((e) => (
            <Pressable
              key={e}
              style={styles.composerQuickTap}
              onPress={() => onQuickReaction(e)}
              hitSlop={6}
            >
              <Text style={styles.composerQuickEmoji}>{e}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.composerInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.42)"
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
          editable={!sendDisabled}
          maxLength={280}
        />
        <Pressable style={styles.composerIconBtn} onPress={onEmojiPress} hitSlop={8}>
          <Ionicons name="happy-outline" size={17} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Pressable
          style={[styles.composerIconBtn, !canSend && styles.composerIconBtnDim]}
          onPress={handleSend}
          hitSlop={8}
          disabled={!canSend}
        >
          <Ionicons
            name="send"
            size={15}
            color={canSend ? colors.gold : 'rgba(255,255,255,0.28)'}
          />
        </Pressable>
      </View>
    </View>
  );
}

export function useComposerPlaceholderCycle(active: boolean, draft: string) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * COMPOSER_PLACEHOLDERS.length));
  useEffect(() => {
    if (!active || draft.trim()) return undefined;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % COMPOSER_PLACEHOLDERS.length);
    }, 9000);
    return () => clearInterval(t);
  }, [active, draft]);
  return idx;
}

const styles = StyleSheet.create({
  floatChatColumn: {
    position: 'absolute',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    zIndex: 14,
  },
  floatChatRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: 5,
    backgroundColor: 'transparent',
  },
  chatAvatarTiny: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  floatChatTextBlock: {
    flex: 1,
    flexShrink: 1,
  },
  chatNameInline: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
  chatNameHost: {
    color: colors.gold,
  },
  chatMsgInline: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
  composerWrap: {
    position: 'absolute',
    borderRadius: radii.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 15,
  },
  composerAndroidUnderlay: {
    backgroundColor: 'rgba(18,18,18,0.72)',
  },
  composerTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,8,0.32)',
  },
  composerInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
    paddingRight: 2,
    zIndex: 1,
  },
  composerQuickInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 2,
  },
  composerQuickTap: {
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  composerQuickEmoji: {
    fontSize: 12,
    lineHeight: 14,
  },
  composerInput: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '500',
    paddingVertical: Platform.OS === 'ios' ? 9 : 5,
    paddingHorizontal: 4,
    marginRight: 2,
  },
  composerIconBtn: {
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  composerIconBtnDim: {
    opacity: 0.5,
  },
});
