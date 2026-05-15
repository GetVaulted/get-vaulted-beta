import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../../theme';
import type { ChatMessage, LiveStream } from '../../types';
import type { LiveStackParamList, MainTabParamList } from '../../navigation/types';
import { rootNavigationRef } from '../../navigation/rootNavigationRef';
import { LiveBadge } from '../ui/LiveBadge';
import { LivePinnedActionBar, LIVE_COMMERCE_OVERLAY_HEIGHT } from './LivePinnedActionBar';
import { LiveEmptyBroadcastBlock } from './LiveEmptyBroadcastBlock';

const { height: WINDOW_HEIGHT } = Dimensions.get('window');

/** Space between floating commerce HUD and composer. */
const COMMERCE_TO_COMPOSER_GAP = 10;

/** Floating composer (pill) — sits above commerce HUD. */
const COMPOSER_BAR_H = 44;
const CHAT_ZONE_GAP = 8;
/** Reserve vertical space for ~6–8 floating rows (matches floatChatColumn maxHeight). */
const CHAT_STACK_RESERVE = 232;

const COMPOSER_PLACEHOLDERS = [
  'Say something…',
  'Join the conversation…',
  'Chat with the room…',
] as const;

const COMPOSER_QUICK_REACTIONS = ['❤️', '🔥', '👏'] as const;

type Props = {
  streams: LiveStream[];
  initialStreamId?: string;
  bottomOffset?: number;
  /** Minimal back control — rendered inside the stream header when provided. */
  onBack?: () => void;
  signedIn?: boolean;
  onRequireAuth?: () => void;
};

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const MAX_FLOATING_CHAT = 8;
const CHAT_CYCLE_MS = 3000;

function chatAvatarUri(message: ChatMessage, hostAvatarUrl: string) {
  if (message.isHost) return hostAvatarUrl;
  return `https://i.pravatar.cc/80?u=${encodeURIComponent(message.user)}`;
}

type AnimatedChatRow = {
  uid: string;
  message: ChatMessage;
  opacity: Animated.Value;
  translateY: Animated.Value;
};

function FloatingLiveChat({
  pool,
  hostAvatarUrl,
  bottom,
  left,
  rightEdge,
  isActive,
  streamKey,
}: {
  pool: ChatMessage[];
  hostAvatarUrl: string;
  bottom: number;
  left: number;
  rightEdge: number;
  isActive: boolean;
  streamKey: string;
}) {
  const activeRef = useRef(isActive);
  activeRef.current = isActive;
  const poolRef = useRef(pool);
  poolRef.current = pool;
  const cursorRef = useRef(0);
  const rowsRef = useRef<AnimatedChatRow[]>([]);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!isActive || pool.length === 0) {
      rowsRef.current = [];
      bump();
      return;
    }
    const n = Math.min(MAX_FLOATING_CHAT, pool.length);
    cursorRef.current = n;
    rowsRef.current = pool.slice(0, n).map((m, i) => ({
      uid: `${streamKey}-${m.id}-init${i}`,
      message: m,
      opacity: new Animated.Value(1),
      translateY: new Animated.Value(0),
    }));
    bump();
  }, [isActive, pool, streamKey]);

  useEffect(() => {
    if (!isActive || poolRef.current.length === 0) return undefined;

    const advance = () => {
      if (!activeRef.current) return;
      const prev = rowsRef.current;
      if (prev.length === 0) return;
      const first = prev[0];
      Animated.parallel([
        Animated.timing(first.opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        Animated.timing(first.translateY, { toValue: -22, duration: 700, useNativeDriver: true }),
      ]).start(() => {
        if (!activeRef.current) return;
        const inner = rowsRef.current;
        if (inner.length === 0 || inner[0].uid !== first.uid) return;
        const rest = inner.slice(1);
        const p = poolRef.current;
        const m = p[cursorRef.current % p.length];
        cursorRef.current += 1;
        const newRow: AnimatedChatRow = {
          uid: `${streamKey}-${m.id}-${cursorRef.current}`,
          message: m,
          opacity: new Animated.Value(0),
          translateY: new Animated.Value(12),
        };
        rowsRef.current = [...rest, newRow];
        bump();
        requestAnimationFrame(() => {
          Animated.parallel([
            Animated.timing(newRow.opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
            Animated.timing(newRow.translateY, { toValue: 0, duration: 450, useNativeDriver: true }),
          ]).start();
        });
      });
    };

    const tid = setInterval(advance, CHAT_CYCLE_MS);
    return () => clearInterval(tid);
  }, [isActive, streamKey]);

  const rows = rowsRef.current;
  void tick;
  if (rows.length === 0) return null;

  return (
    <View
      style={[styles.floatChatColumn, { bottom, left, right: rightEdge }]}
      pointerEvents="none"
    >
      {rows.map((row) => {
        const m = row.message;
        const name = m.isHost ? 'HOST' : m.user;
        return (
          <Animated.View
            key={row.uid}
            style={[
              styles.floatChatRow,
              {
                opacity: row.opacity,
                transform: [{ translateY: row.translateY }],
              },
            ]}
          >
            <Image
              source={{ uri: chatAvatarUri(m, hostAvatarUrl) }}
              style={styles.chatAvatarTiny}
            />
            <Text style={styles.floatChatTextBlock} numberOfLines={2}>
              <Text style={[styles.chatNameInline, m.isHost && styles.chatNameHost]}>{name}: </Text>
              <Text style={styles.chatMsgInline}>{m.text}</Text>
            </Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

function FloatingChatComposer({
  bottom,
  left,
  rightEdge,
  value,
  onChangeText,
  onSend,
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
  placeholderIndex: number;
  onQuickReaction: (emoji: string) => void;
  onEmojiPress: () => void;
}) {
  const canSend = value.trim().length > 0;
  const placeholder = COMPOSER_PLACEHOLDERS[placeholderIndex % COMPOSER_PLACEHOLDERS.length];

  return (
    <View
      style={[styles.composerWrap, { bottom, left, right: rightEdge, height: COMPOSER_BAR_H }]}
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
          onSubmitEditing={onSend}
          maxLength={280}
        />
        <Pressable
          style={styles.composerIconBtn}
          onPress={onEmojiPress}
          hitSlop={8}
        >
          <Ionicons name="happy-outline" size={17} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Pressable
          style={[styles.composerIconBtn, !canSend && styles.composerIconBtnDim]}
          onPress={onSend}
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

function CompactShopModal({
  visible,
  onClose,
  stream,
}: {
  visible: boolean;
  onClose: () => void;
  stream: LiveStream;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.shopModalRoot}>
        <Pressable style={styles.shopModalBackdrop} onPress={onClose} accessibilityLabel="Dismiss shop" />
        <View style={styles.shopDrawer}>
          <View style={styles.shopDrawerHeader}>
            <Text style={styles.shopDrawerTitle}>Shop this room</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.shopDrawerPinned} numberOfLines={2}>
            {stream.pinnedProductLabel}
          </Text>
          <ScrollView style={styles.shopDrawerScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.shopDrawerMuted}>
              Lane inventory, buy-now SKUs, and pinned lots — compact overlay, not a room takeover.
            </Text>
            <View style={styles.shopPlaceholderCard}>
              <Ionicons name="bag-handle-outline" size={28} color={colors.gold} />
              <Text style={styles.shopPlaceholderTitle}>Inventory rail</Text>
              <Text style={styles.shopDrawerMuted}>Hooks to seller catalog & live pins.</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function LiveSlide({
  stream,
  isActive,
  height,
  bottomReserve,
  onBack,
  signedIn = true,
  onRequireAuth,
}: {
  stream: LiveStream;
  isActive: boolean;
  height: number;
  bottomReserve: number;
  onBack?: () => void;
  signedIn?: boolean;
  onRequireAuth?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const stackNav = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const tabNav = stackNav.getParent<BottomTabNavigationProp<MainTabParamList>>();
  const [following, setFollowing] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [composerPlaceholderIdx, setComposerPlaceholderIdx] = useState(() =>
    Math.floor(Math.random() * COMPOSER_PLACEHOLDERS.length)
  );

  useEffect(() => {
    if (chatDraft.trim()) return undefined;
    const t = setInterval(() => {
      setComposerPlaceholderIdx((i) => (i + 1) % COMPOSER_PLACEHOLDERS.length);
    }, 9000);
    return () => clearInterval(t);
  }, [chatDraft]);

  const chatPool = useMemo(() => {
    const c = stream.chat;
    if (!c.length) return [];
    return [...c, ...c, ...c];
  }, [stream.chat]);

  const dockPaddingBottom = Math.max(bottomReserve + spacing.xs, insets.bottom + 12);
  const commerceTop = dockPaddingBottom + LIVE_COMMERCE_OVERLAY_HEIGHT;
  const chatRightEdge = 88;

  const composerBottom = commerceTop + COMMERCE_TO_COMPOSER_GAP;
  const chatBottom = composerBottom + COMPOSER_BAR_H + CHAT_ZONE_GAP;

  const sendFloatingChat = () => {
    if (!signedIn) {
      onRequireAuth?.();
      return;
    }
    const t = chatDraft.trim();
    if (!t) return;
    setChatDraft('');
  };

  const appendComposer = (emoji: string) => {
    setChatDraft((d) => {
      const cur = d.trim();
      return cur ? `${cur} ${emoji}` : emoji;
    });
  };

  const openDiscover = () => tabNav?.navigate('Discover');

  const openProfileSettings = () => {
    if (rootNavigationRef.isReady()) rootNavigationRef.navigate('ProfileEdit');
  };

  const shareRoom = async () => {
    try {
      await Share.share({
        message: `Watch “${stream.title}” with ${stream.host.name} on Get Vaulted`,
      });
    } catch {
      /* cancelled */
    }
  };

  const shareClipFromRoom = async () => {
    try {
      await Share.share({
        message: `Clip from “${stream.title}” on Get Vaulted`,
      });
    } catch {
      /* cancelled */
    }
  };

  return (
    <View style={[styles.slide, { height }]}>
      {/* CENTER — stream hero */}
      <Image
        source={{ uri: stream.previewImageUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <LinearGradient
        colors={stream.thumbnailGradient}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.16 }]}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.28)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* TOP — cinematic header: identity left, stat center, controls right */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 6,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        <View style={styles.topBarRow}>
          <View style={styles.topBarLeft}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.backIconOnly}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.92)" />
              </Pressable>
            ) : null}
            <Pressable
              style={styles.hostIdentity}
              onPress={openDiscover}
              accessibilityRole="button"
              accessibilityLabel={`Host ${stream.host.name}`}
            >
              <Image source={{ uri: stream.host.avatarUrl }} style={styles.hostAvatarTop} />
              <View style={styles.hostTextCol}>
                <Text style={styles.hostNameTop} numberOfLines={1}>
                  {stream.host.name}
                </Text>
                <Text style={styles.hostSubtitleTop} numberOfLines={1}>
                  {stream.title}
                </Text>
                {stream.pinnedItemSubtitle ? (
                  <Text style={styles.hostMetaLine} numberOfLines={1}>
                    {stream.pinnedItemSubtitle}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          </View>

          <View style={styles.topBarRight}>
            <View style={styles.liveStatusCluster}>
              <LiveBadge compact pulse />
              <Text style={styles.viewersTopRight}>{formatViewers(stream.viewers)}</Text>
            </View>
            <Pressable
              style={styles.iconTopBare}
              onPress={() => void Linking.openSettings()}
              accessibilityLabel="Mute or audio options"
            >
              <Ionicons name="volume-high-outline" size={20} color="rgba(255,255,255,0.88)" />
            </Pressable>
            <Pressable
              style={styles.iconTopBare}
              onPress={openProfileSettings}
              accessibilityLabel="Stream settings"
            >
              <Ionicons name="settings-outline" size={19} color="rgba(255,255,255,0.88)" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* RIGHT — creator actions (commerce via Shop modal, not a bottom sheet). */}
      <View
        style={[
          styles.rightRail,
          {
            bottom: commerceTop + spacing.sm,
          },
        ]}
      >
        <Pressable
          style={styles.railBtn}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            setFollowing((f) => !f);
          }}
          accessibilityLabel={following ? 'Unfollow host' : 'Follow host'}
        >
          <Ionicons
            name={following ? 'checkmark-circle-outline' : 'person-add-outline'}
            size={22}
            color={following ? colors.gold : 'rgba(255,255,255,0.92)'}
          />
          <Text style={styles.railLabel}>{following ? 'Following' : 'Follow'}</Text>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            tabNav?.navigate('TradeCenter', { screen: 'TradeCenterHome' });
          }}
        >
          <Ionicons name="wallet-outline" size={22} color="rgba(255,255,255,0.92)" />
          <Text style={styles.railLabel}>Wallet</Text>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            setShopOpen(true);
          }}
          accessibilityLabel="Shop this room"
        >
          <Ionicons name="bag-handle-outline" size={22} color="rgba(255,255,255,0.92)" />
          <Text style={styles.railLabel}>Shop</Text>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            void shareClipFromRoom();
          }}
        >
          <Ionicons name="cut-outline" size={22} color="rgba(255,255,255,0.92)" />
          <Text style={styles.railLabel}>Clip</Text>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            void shareRoom();
          }}
        >
          <Ionicons name="share-outline" size={22} color="rgba(255,255,255,0.92)" />
          <Text style={styles.railLabel}>Share</Text>
        </Pressable>
      </View>

      {/* Floating chat — ambient; transparent */}
      {chatPool.length > 0 ? (
        <FloatingLiveChat
          pool={chatPool}
          hostAvatarUrl={stream.host.avatarUrl}
          bottom={chatBottom}
          left={spacing.lg}
          rightEdge={chatRightEdge}
          isActive={isActive}
          streamKey={stream.id}
        />
      ) : null}

      {/* Glass composer */}
      <FloatingChatComposer
        bottom={composerBottom}
        left={spacing.lg}
        rightEdge={chatRightEdge}
        value={chatDraft}
        onChangeText={setChatDraft}
        onSend={sendFloatingChat}
        placeholderIndex={composerPlaceholderIdx}
        onQuickReaction={appendComposer}
        onEmojiPress={() => appendComposer('😊')}
      />

      {/* Floating live-commerce HUD — only persistent bottom chrome */}
      <View
        style={[
          styles.commerceOverlayHost,
          {
            bottom: dockPaddingBottom,
            left: spacing.md,
            right: spacing.md,
          },
        ]}
      >
        <LivePinnedActionBar
          stream={stream}
          bottomSafeInset={insets.bottom}
          signedIn={signedIn}
          onRequireAuth={onRequireAuth}
          onOpenInlineShop={() => setShopOpen(true)}
        />
      </View>

      <CompactShopModal visible={shopOpen} onClose={() => setShopOpen(false)} stream={stream} />
    </View>
  );
}

export function VerticalLiveFeed({
  streams,
  initialStreamId,
  bottomOffset,
  onBack,
  signedIn = true,
  onRequireAuth,
}: Props) {
  const insets = useSafeAreaInsets();
  const reserve = bottomOffset ?? insets.bottom + 16;
  const pageHeight = Math.max(WINDOW_HEIGHT - reserve, 520);

  const startIndex = useMemo(() => {
    if (!initialStreamId) return 0;
    const i = streams.findIndex((s) => s.id === initialStreamId);
    return i >= 0 ? i : 0;
  }, [initialStreamId, streams]);

  const [page, setPage] = useState(startIndex);

  useEffect(() => {
    setPage(startIndex);
  }, [startIndex]);

  if (!streams.length) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingHorizontal: spacing.lg,
          justifyContent: 'center',
          gap: spacing.md,
        }}
      >
        <LiveEmptyBroadcastBlock
          subtitle="This show may have ended or is not available yet. Explore listings or start your own broadcast."
        />
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={{
              alignSelf: 'center',
              marginTop: spacing.sm,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: colors.borderStrong,
            }}
          >
            <Text style={{ color: colors.gold, fontWeight: '800' }}>Go back</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <PagerView
      key={initialStreamId ?? 'default'}
      style={{ flex: 1 }}
      initialPage={startIndex}
      orientation="vertical"
      onPageSelected={(e) => setPage(e.nativeEvent.position)}
    >
      {streams.map((stream, index) => (
        <View key={stream.id} style={{ flex: 1 }} collapsable={false}>
          <LiveSlide
            stream={stream}
            isActive={index === page}
            height={pageHeight}
            bottomReserve={reserve}
            onBack={onBack}
            signedIn={signedIn}
            onRequireAuth={onRequireAuth}
          />
        </View>
      ))}
    </PagerView>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 12,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 40,
  },
  topBarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
    gap: 2,
    zIndex: 2,
    paddingRight: spacing.sm,
  },
  backIconOnly: {
    marginRight: 2,
    marginLeft: -4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hostIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 0,
  },
  hostAvatarTop: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  hostTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-start',
  },
  hostNameTop: {
    flexShrink: 1,
    color: 'rgba(255,255,255,0.96)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  hostSubtitleTop: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.05,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hostMetaLine: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: -0.05,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  liveStatusCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 2,
  },
  viewersTopRight: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
    zIndex: 2,
    paddingTop: 2,
  },
  iconTopBare: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightRail: {
    position: 'absolute',
    right: spacing.sm,
    alignItems: 'center',
    gap: 14,
    zIndex: 5,
  },
  railBtn: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    minWidth: 48,
  },
  railLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  floatChatColumn: {
    position: 'absolute',
    maxHeight: CHAT_STACK_RESERVE,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    zIndex: 4,
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
    zIndex: 5,
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
  commerceOverlayHost: {
    position: 'absolute',
    zIndex: 14,
    pointerEvents: 'box-none',
  },
  shopModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  shopModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  shopDrawer: {
    maxHeight: 340,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    backgroundColor: 'rgba(12,12,12,0.97)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.2)',
  },
  shopDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  shopDrawerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  shopDrawerPinned: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  shopDrawerScroll: {
    maxHeight: 280,
  },
  shopDrawerMuted: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  shopPlaceholderCard: {
    padding: spacing.xl,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    gap: spacing.sm,
  },
  shopPlaceholderTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
});
