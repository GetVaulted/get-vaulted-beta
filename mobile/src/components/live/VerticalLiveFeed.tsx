import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../../theme';
import { fetchLiveRoomPublicById } from '../../api/liveRoomsRepository';
import type { LiveStream, ChatMessage } from '../../types';
import type { LiveStackParamList, MainTabParamList } from '../../navigation/types';
import { rootNavigationRef } from '../../navigation/rootNavigationRef';
import { openUserProfile } from '../../navigation/openPlatform';
import { UserAvatar } from '../ui/UserAvatar';
import { LiveAuctionSoldCelebration } from './LiveAuctionSoldCelebration';
import { VaultRevealWheelOverlay } from './VaultRevealWheelOverlay';
import { LiveGiveawayEnterChip } from './LiveGiveawayEnterChip';
import {
  CHAT_ABOVE_COMPOSER_GAP,
  COMPOSER_BAR_HEIGHT,
  computeChatStackMaxHeight,
  computeLiveRoomBottomStack,
  DEFAULT_COMMERCE_OVERLAY_HEIGHT,
} from '../../lib/liveRoomBottomLayout';
import { useLiveRoomChat } from '../../hooks/useLiveRoomChat';
import { liveRoomChatOpen } from '../../lib/liveRoomChatPolicy';
import { useLiveRoomRealtimeSession } from '../../hooks/useLiveRoomRealtimeSession';
import { BreakDisclaimerModal, breakDisclaimerStorageKey, readBreakDisclaimerAccepted, writeBreakDisclaimerAccepted } from './BreakDisclaimerModal';
import { useLiveRoomModeration } from '../../hooks/useLiveRoomModeration';
import { showModeratorTools } from '../../lib/liveModeratorPermissions';
import { ModeratorActionSheet } from '../moderator/ModeratorActionSheet';
import { ModeratorDrawer } from '../moderator/ModeratorDrawer';
import { HostModeratorAssignSheet } from '../moderator/HostModeratorAssignSheet';
import {
  HostModeratorAssignButton,
  ModeratorToolsButton,
} from '../moderator/ModeratorFloatingButton';
import { ReportSheet } from '../trust/ReportSheet';
import {
  FloatingChatComposer,
  FloatingLiveChat,
} from './floatingLiveChat';
import { LiveTipSheet } from './LiveTipSheet';
import { LivePinnedActionBar } from './LivePinnedActionBar';
import { LivePaymentFailureModal } from './LivePaymentFailureModal';
import { PAYMENT_RECOVERY_SUCCESS_TOAST } from '../../lib/livePaymentFailureCopy';
import { LiveEmptyBroadcastBlock } from './LiveEmptyBroadcastBlock';
import { LiveStagePlayback } from './LiveStagePlayback';
import { LiveRoomText } from './LiveRoomText';
import { LiveBadge } from '../ui/LiveBadge';
import {
  computeLiveStageContainer,
  computeLiveStageHostStyle,
  computeLiveStageRootStyle,
  computeLiveStageSafeInsets,
  computeLiveTopReserve,
  LIVE_STAGE_CONTENT_FIT,
  logLiveStageLayoutDebug,
  type LiveStageContainer,
} from '../../lib/liveRoomViewport';
import { isCompactLiveRoomLayout } from '../../lib/liveRoomUiScale';
import { buildLiveRoomShareMessage } from '../../lib/liveRoomShare';

function chatRightEdgeForWidth(layoutWidth: number): number {
  return isCompactLiveRoomLayout(layoutWidth) ? 84 : 92;
}

type Props = {
  streams: LiveStream[];
  initialStreamId?: string;
  /** Minimal back control — rendered inside the stream header when provided. */
  onBack?: () => void;
  signedIn?: boolean;
  onRequireAuth?: () => void;
  accessToken?: string;
  userId?: string;
};

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
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
  stageContainer,
  screenHeight,
  onBack,
  signedIn = true,
  onRequireAuth,
  accessToken,
  userId,
  onWalletOverlayChange,
  onPaymentBlockerChange,
}: {
  stream: LiveStream;
  isActive: boolean;
  stageContainer: LiveStageContainer;
  screenHeight: number;
  onBack?: () => void;
  signedIn?: boolean;
  onRequireAuth?: () => void;
  accessToken?: string;
  userId?: string;
  onWalletOverlayChange?: (active: boolean) => void;
  onPaymentBlockerChange?: (active: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const stageInsets = computeLiveStageSafeInsets(stageContainer, screenHeight, insets, spacing.sm);
  const stackNav = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const tabNav = stackNav.getParent<BottomTabNavigationProp<MainTabParamList>>();
  const openWalletRef = useRef<(reason?: string) => void>(() => {});
  const layoutWidth = stageContainer.designWidth;
  const compact = isCompactLiveRoomLayout(layoutWidth);
  const chatRightEdge = chatRightEdgeForWidth(layoutWidth);
  const [following, setFollowing] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [streamMuted, setStreamMuted] = useState(true);
  const [streamRefreshNonce, setStreamRefreshNonce] = useState(0);
  const [roomStatus, setRoomStatus] = useState(stream.roomStatus);
  const [commerceHeight, setCommerceHeight] = useState(DEFAULT_COMMERCE_OVERLAY_HEIGHT);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [breakDisclaimerAccepted, setBreakDisclaimerAccepted] = useState(true);
  const [breakDisclaimerReady, setBreakDisclaimerReady] = useState(false);
  const [paymentRecoveryToast, setPaymentRecoveryToast] = useState<string | null>(null);
  const [modDrawerOpen, setModDrawerOpen] = useState(false);
  const [modAssignOpen, setModAssignOpen] = useState(false);
  const [modActionMessage, setModActionMessage] = useState<ChatMessage | null>(null);

  const leaveRoomSafely = useCallback(() => {
    if (stackNav.canGoBack()) {
      stackNav.goBack();
      return;
    }
    onBack?.();
  }, [stackNav, onBack]);

  const liveChat = useLiveRoomChat({
    roomId: stream.id,
    hostUsername: stream.host.handle.replace(/^@/, '') || stream.host.name,
    accessToken,
    enabled: isActive,
    realtimePrimary: true,
  });

  const liveSession = useLiveRoomRealtimeSession({
    roomId: stream.id,
    accessToken,
    userId,
    enabled: isActive,
    hostUsername: stream.host.handle.replace(/^@/, '') || stream.host.name,
    onChatBroadcast: (message) => {
      if (!message.id) {
        void liveChat.reload();
        return;
      }
      liveChat.appendBroadcast(message);
    },
    onStreamRefresh: () => {
      setStreamRefreshNonce((n) => n + 1);
      setRoomStatus((prev) => (prev === 'ended' ? prev : 'live'));
    },
  });

  useEffect(() => {
    if (!isActive || (stream.liveRoomFormat !== 'break' && liveSession.roomSnap?.roomType !== 'break')) {
      setBreakDisclaimerAccepted(true);
      setBreakDisclaimerReady(true);
      return;
    }
    const key = breakDisclaimerStorageKey(stream.id, userId);
    void readBreakDisclaimerAccepted(key).then((accepted) => {
      setBreakDisclaimerAccepted(accepted);
      setBreakDisclaimerReady(true);
    });
  }, [isActive, stream.id, stream.liveRoomFormat, userId]);

  const breakParticipationBlocked =
    breakDisclaimerReady &&
    (stream.liveRoomFormat === 'break' || liveSession.roomSnap?.roomType === 'break') &&
    !breakDisclaimerAccepted;

  useEffect(() => {
    setRoomStatus(stream.roomStatus);
  }, [stream.id, stream.roomStatus]);

  useEffect(() => {
    if (!isActive || roomStatus === 'live' || roomStatus === 'ended') return undefined;
    const id = setInterval(() => {
      void fetchLiveRoomPublicById(stream.id).then((row) => {
        if (!row?.status || row.status === roomStatus) return;
        setRoomStatus(row.status);
        if (row.status === 'live') setStreamRefreshNonce((n) => n + 1);
      });
    }, 15_000);
    return () => clearInterval(id);
  }, [isActive, roomStatus, stream.id]);

  const hostHandle = stream.host.handle.replace(/^@/, '') || stream.host.name;
  const moderation = useLiveRoomModeration({
    roomId: stream.id,
    accessToken,
    enabled: isActive,
  });

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardOffset(e.endCoordinates.height - insets.bottom);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOffset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  useEffect(() => {
    if (!isActive) return;
    logLiveStageLayoutDebug({
      roomId: stream.id,
      screenWidth: stageContainer.designWidth,
      screenHeight,
      designWidth: stageContainer.designWidth,
      designHeight: stageContainer.designHeight,
      uniformScale: stageContainer.uniformScale,
      layoutWidth: stageContainer.layoutWidth,
      layoutHeight: stageContainer.layoutHeight,
      offsetLeft: stageContainer.offsetLeft,
      offsetTop: stageContainer.offsetTop,
      contentFit: LIVE_STAGE_CONTENT_FIT,
    });
  }, [isActive, stream.id, stageContainer, screenHeight]);

  useEffect(() => {
    if (!isActive || !signedIn || !accessToken || !liveRoomChatOpen(roomStatus)) return;
    void liveChat.announceJoin().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      moderation.handleRestrictionError(msg);
    });
  }, [isActive, signedIn, accessToken, roomStatus, liveChat.announceJoin, moderation.handleRestrictionError]);

  const chatPool = liveChat.messages;

  const dockPaddingBottom = stageInsets.bottom;
  const bottomStack = computeLiveRoomBottomStack({
    dockPaddingBottom,
    commerceHeight,
    keyboardOffset: keyboardOffset / Math.max(0.001, stageContainer.uniformScale),
    compact,
  });
  const chatMaxHeight = computeChatStackMaxHeight({
    slideHeight: stageContainer.designHeight,
    topReserve: computeLiveTopReserve(stageInsets.top, layoutWidth),
    chatBottom: bottomStack.chatBottom,
  });

  const sendFloatingChat = useCallback(async () => {
    if (!signedIn) {
      onRequireAuth?.();
      return;
    }
    if (breakParticipationBlocked) {
      Alert.alert('Accept notice', 'Accept the live break notice before chatting.');
      return;
    }
    const t = chatDraft.trim();
    if (!t || liveChat.sending) return;
    try {
      const ok = await liveChat.send(t);
      if (ok) setChatDraft('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      moderation.handleRestrictionError(msg);
      if (__DEV__) console.warn('[liveRoom chat] send failed', msg);
    }
  }, [signedIn, onRequireAuth, breakParticipationBlocked, chatDraft, liveChat.sending, liveChat.send, moderation.handleRestrictionError]);

  const openMarketplace = () => tabNav?.navigate('Marketplace');

  const openProfileSettings = () => {
    if (rootNavigationRef.isReady()) rootNavigationRef.navigate('Settings');
  };

  const shareRoom = async () => {
    const { title, message, url } = buildLiveRoomShareMessage(stream);
    try {
      await Share.share({
        title,
        message,
        url: Platform.OS === 'ios' && url ? url : undefined,
      });
      if (signedIn && accessToken) {
        void liveChat.announceShare();
      }
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
    <>
      {liveSession.connectionBanner ? (
        <View style={styles.connectionBanner} pointerEvents="none">
          <Text style={styles.connectionBannerTxt}>{liveSession.connectionBanner}</Text>
        </View>
      ) : null}
      {liveSession.showOutbidToast ? (
        <View style={styles.outbidToast} pointerEvents="none">
          <Text style={styles.outbidToastTxt}>Outbid — new high bid on this item</Text>
        </View>
      ) : null}
      {paymentRecoveryToast ? (
        <View style={styles.recoveryToast} pointerEvents="none">
          <Text style={styles.recoveryToastTxt}>{paymentRecoveryToast}</Text>
        </View>
      ) : null}
      <LiveAuctionSoldCelebration
        celebration={liveSession.soldCelebration}
        onDone={liveSession.clearSoldCelebration}
      />
      <VaultRevealWheelOverlay
        spin={liveSession.vaultRevealSpin}
        onDismiss={liveSession.clearVaultRevealSpin}
      />
      <View style={styles.slide}>
        <View style={computeLiveStageHostStyle(stageContainer)}>
          <View style={[styles.stageRoot, computeLiveStageRootStyle(stageContainer)]}>
            <View style={styles.stageVideoFrame}>
              <LiveStagePlayback
                roomId={stream.id}
                roomStatus={roomStatus}
                scheduledStartAtIso={stream.scheduledStartAtIso}
                thumbnailUrl={stream.previewImageUrl}
                enabled={isActive}
                accessToken={accessToken}
                refreshNonce={streamRefreshNonce}
                muted={streamMuted}
                onMutedChange={setStreamMuted}
              />
              <LinearGradient
                colors={stream.thumbnailGradient}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={[StyleSheet.absoluteFill, { opacity: 0.08 }]}
                pointerEvents="none"
              />
            </View>

            {/* TOP — header overlays the 9:16 stage */}
            <View
              style={[
                styles.topBar,
                {
                  paddingTop: stageInsets.top + (compact ? 4 : 6),
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
              onPress={openMarketplace}
              accessibilityRole="button"
              accessibilityLabel={`Host ${stream.host.name}`}
            >
              <UserAvatar
                uri={stream.host.avatarUrl}
                name={stream.host.name}
                username={stream.host.handle}
                size={compact ? 28 : 32}
                borderColor="rgba(255,255,255,0.35)"
              />
              <View style={styles.hostTextCol}>
                <LiveRoomText style={[styles.hostNameTop, compact && styles.hostNameTopCompact]} numberOfLines={1}>
                  {stream.host.name}
                </LiveRoomText>
                <LiveRoomText style={[styles.hostSubtitleTop, compact && styles.hostSubtitleTopCompact]} numberOfLines={1}>
                  {stream.title}
                </LiveRoomText>
                {stream.pinnedItemSubtitle && !compact ? (
                  <LiveRoomText style={styles.hostMetaLine} numberOfLines={1}>
                    {stream.pinnedItemSubtitle}
                  </LiveRoomText>
                ) : null}
              </View>
            </Pressable>
          </View>

          <View style={styles.topBarRight}>
            <View style={styles.liveStatusCluster}>
              {roomStatus === 'live' ? (
                <LiveBadge compact pulse inline />
              ) : roomStatus === 'scheduled' ? (
                <LiveBadge compact inline label="SOON" variant="scheduled" pulse={false} />
              ) : (
                <LiveRoomText style={styles.endedBadge}>ENDED</LiveRoomText>
              )}
              <LiveRoomText style={[styles.viewersTopRight, compact && styles.viewersTopRightCompact]}>
                {formatViewers(stream.viewers)}
              </LiveRoomText>
            </View>
            <Pressable
              style={styles.iconTopBare}
              onPress={() => setStreamMuted((m) => !m)}
              accessibilityLabel={streamMuted ? 'Unmute stream' : 'Mute stream'}
            >
              <Ionicons
                name={streamMuted ? 'volume-mute-outline' : 'volume-high-outline'}
                size={20}
                color="rgba(255,255,255,0.88)"
              />
            </Pressable>
            <Pressable
              style={styles.iconTopBare}
              onPress={openProfileSettings}
              accessibilityLabel="Stream settings"
            >
              <Ionicons name="settings-outline" size={19} color="rgba(255,255,255,0.88)" />
            </Pressable>
            <Pressable
              style={styles.iconTopBare}
              onPress={() => {
                if (!signedIn) {
                  onRequireAuth?.();
                  return;
                }
                setReportOpen(true);
              }}
              accessibilityLabel="Report show"
            >
              <Ionicons name="flag-outline" size={19} color="rgba(255,255,255,0.88)" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* RIGHT — creator actions (commerce via Shop modal, not a bottom sheet). */}
      <View
        style={[
          styles.rightRail,
          compact && styles.rightRailCompact,
          {
            bottom: bottomStack.commerceTop + spacing.sm,
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
          <LiveRoomText style={styles.railLabel}>{following ? 'Following' : 'Follow'}</LiveRoomText>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            if (rootNavigationRef.isReady()) {
              rootNavigationRef.navigate('MessageCompose', { liveRoomId: stream.id });
            }
          }}
          accessibilityLabel="Message seller privately"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.gold} />
          <LiveRoomText style={[styles.railLabel, { color: colors.gold }]}>Message</LiveRoomText>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            if (!accessToken) {
              Alert.alert('Sign in required', 'Log in to send a tip.');
              return;
            }
            setTipOpen(true);
          }}
          accessibilityLabel="Send a tip"
        >
          <Ionicons name="cash-outline" size={22} color={colors.gold} />
          <LiveRoomText style={[styles.railLabel, { color: colors.gold }]}>Tip</LiveRoomText>
        </Pressable>
        <Pressable
          style={[styles.railBtn, compact && styles.railBtnCompact]}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            openWalletRef.current('rail_wallet');
          }}
          accessibilityLabel="Wallet"
        >
          <Ionicons name="wallet-outline" size={compact ? 20 : 22} color="rgba(255,255,255,0.92)" />
          <LiveRoomText style={styles.railLabel}>Wallet</LiveRoomText>
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
          <LiveRoomText style={styles.railLabel}>Shop</LiveRoomText>
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
          <LiveRoomText style={styles.railLabel}>Clip</LiveRoomText>
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
          <LiveRoomText style={styles.railLabel}>Share</LiveRoomText>
        </Pressable>
      </View>

      <FloatingLiveChat
        pool={chatPool}
        hostAvatarUrl={stream.host.avatarUrl}
        hostUserId={stream.host.id}
        bottom={bottomStack.chatBottom}
        left={spacing.lg}
        rightEdge={chatRightEdge}
        maxHeight={chatMaxHeight}
        compact={compact}
        isActive={isActive}
        streamKey={stream.id}
        liveRoomId={stream.id}
        accessToken={accessToken}
        canModerate={moderation.canModerate}
        isModerator={moderation.isModerator}
        viewerRole={moderation.viewerRole}
        onLongPressMessage={(message) => setModActionMessage(message)}
        onModerationComplete={() => {
          void liveChat.reload();
          void moderation.reload();
        }}
        onPressMentionUser={(userId) => openUserProfile(userId)}
      />

      {showModeratorTools(moderation.isModerator) && accessToken ? (
        <ModeratorDrawer
          visible={modDrawerOpen}
          onClose={() => setModDrawerOpen(false)}
          liveRoomId={stream.id}
          hostUserId={stream.host.id}
          accessToken={accessToken}
          moderation={moderation}
          onRefresh={() => {
            void moderation.reload();
            void liveChat.reload();
          }}
        />
      ) : null}

      {moderation.isHost && accessToken ? (
        <HostModeratorAssignSheet
          visible={modAssignOpen}
          onClose={() => setModAssignOpen(false)}
          liveRoomId={stream.id}
          accessToken={accessToken}
          moderation={moderation}
          hostUserId={stream.host.id}
          onRefresh={() => void moderation.reload()}
        />
      ) : null}

      {modActionMessage && moderation.isModerator ? (
        <ModeratorActionSheet
          visible={Boolean(modActionMessage)}
          onClose={() => setModActionMessage(null)}
          liveRoomId={stream.id}
          accessToken={accessToken}
          isModerator={moderation.isModerator}
          isHost={moderation.isHost}
          moderatorLevel={moderation.moderatorLevel}
          allowedActions={moderation.allowedActions}
          messageId={modActionMessage.id}
          messageText={modActionMessage.text}
          senderId={modActionMessage.senderId}
          senderUsername={modActionMessage.user}
          hostUserId={stream.host.id}
          onComplete={() => {
            setModActionMessage(null);
            void liveChat.reload();
            void moderation.reload();
          }}
        />
      ) : null}

      {moderation.roomBlocked ||
      moderation.myRestrictions?.roomBanned ||
      moderation.myRestrictions?.kickedUntil ||
      moderation.myRestrictions?.sellerStreamBanned ? (
        <View style={[styles.blockedBanner, { top: stageInsets.top + 56 }]}>
          <LiveRoomText style={styles.blockedBannerText}>
            You cannot participate in this room.
          </LiveRoomText>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.blockedBannerBtn}>
              <LiveRoomText style={styles.blockedBannerBtnText}>Leave show</LiveRoomText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {(moderation.myRestrictions?.muted || liveChat.error?.includes('muted')) && !moderation.roomBlocked ? (
        <View style={[styles.mutedBanner, { bottom: bottomStack.composerBottom + COMPOSER_BAR_HEIGHT + 8 }]}>
          <LiveRoomText style={styles.mutedBannerText}>You are muted in this room.</LiveRoomText>
        </View>
      ) : null}

      <FloatingChatComposer
        bottom={bottomStack.composerBottom}
        left={spacing.lg}
        rightEdge={chatRightEdge}
        value={chatDraft}
        onChangeText={setChatDraft}
        onSend={sendFloatingChat}
        sendDisabled={liveChat.sending || breakParticipationBlocked}
        accessToken={accessToken}
        leadingAccessory={
          <>
            {showModeratorTools(moderation.isModerator) ? (
              <ModeratorToolsButton onPress={() => setModDrawerOpen(true)} />
            ) : null}
            {moderation.isHost && accessToken ? (
              <HostModeratorAssignButton onPress={() => setModAssignOpen(true)} />
            ) : null}
          </>
        }
      />

      {roomStatus === 'live' && (liveSession.roomSnap?.giveaways?.length ?? 0) > 0 ? (
        <View
          style={{
            position: 'absolute',
            left: spacing.md,
            right: spacing.md,
            bottom: bottomStack.commerceBottom + commerceHeight + spacing.sm,
            zIndex: 12,
          }}
        >
          <LiveGiveawayEnterChip
            roomId={stream.id}
            accessToken={accessToken}
            giveaways={liveSession.roomSnap?.giveaways ?? []}
            signedIn={signedIn}
            onRequireAuth={onRequireAuth}
            onEntered={() => void liveSession.fetchSnapshot()}
            onTimerExpired={() => void liveSession.fetchSnapshot()}
          />
        </View>
      ) : null}

      <View
        style={[
          styles.commerceOverlayHost,
          {
            bottom: bottomStack.commerceBottom,
            left: spacing.md,
            right: spacing.md,
          },
        ]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - commerceHeight) > 2) setCommerceHeight(h);
        }}
      >
        <LivePinnedActionBar
          stream={stream}
          bottomSafeInset={stageInsets.bottom}
          signedIn={signedIn}
          onRequireAuth={onRequireAuth}
          accessToken={accessToken}
          onOpenInlineShop={() => setShopOpen(true)}
          roomSnap={liveSession.roomSnap}
          syncRefreshing={liveSession.syncRefreshing}
          onRefreshSnapshot={liveSession.fetchSnapshot}
          clockSkewMs={liveSession.clockSkewMs}
          mergeBidAck={liveSession.mergeBidAck}
          onBidPlaced={(amount) => liveSession.setMyHighBidUsd(amount)}
          participationBlocked={breakParticipationBlocked || Boolean(liveSession.unresolvedPaymentFailure)}
          onWalletOverlayChange={isActive ? onWalletOverlayChange : undefined}
          layoutWidth={layoutWidth}
          onRegisterOpenWallet={(open) => {
            openWalletRef.current = open;
          }}
        />
      </View>
      {liveSession.unresolvedPaymentFailure && signedIn && accessToken ? (
        <LivePaymentFailureModal
          visible
          roomId={stream.id}
          accessToken={accessToken}
          failure={liveSession.unresolvedPaymentFailure}
          onResolved={() => {
            void liveSession.fetchSnapshot();
            setPaymentRecoveryToast(PAYMENT_RECOVERY_SUCCESS_TOAST);
            setTimeout(() => setPaymentRecoveryToast(null), 3600);
          }}
          onLeaveRoom={leaveRoomSafely}
          onWalletOverlayChange={isActive ? onWalletOverlayChange : undefined}
          onBlockerActiveChange={isActive ? onPaymentBlockerChange : undefined}
        />
      ) : null}
          </View>
        </View>
      </View>

      <CompactShopModal visible={shopOpen} onClose={() => setShopOpen(false)} stream={stream} />
      {accessToken ? (
        <LiveTipSheet
          visible={tipOpen}
          onClose={() => setTipOpen(false)}
          liveRoomId={stream.id}
          accessToken={accessToken}
          onError={(msg) => Alert.alert('Tip', msg)}
        />
      ) : null}
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="live_room"
        targetId={stream.id}
        liveRoomId={stream.id}
        accessToken={accessToken}
        title="Report show"
      />
      {breakDisclaimerReady && (stream.liveRoomFormat === 'break' || liveSession.roomSnap?.roomType === 'break') && !breakDisclaimerAccepted ? (
        <BreakDisclaimerModal
          visible
          onAccept={() => {
            const key = breakDisclaimerStorageKey(stream.id, userId);
            void writeBreakDisclaimerAccepted(key);
            setBreakDisclaimerAccepted(true);
          }}
          onDecline={leaveRoomSafely}
        />
      ) : null}
    </>
  );
}

export function VerticalLiveFeed({
  streams,
  initialStreamId,
  onBack,
  signedIn = true,
  onRequireAuth,
  accessToken,
  userId,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [layoutSize, setLayoutSize] = useState<{ width: number; height: number } | null>(null);

  const layoutWidth = layoutSize?.width ?? windowWidth;
  const layoutHeight = layoutSize?.height ?? windowHeight;
  const viewportWidth = layoutWidth;
  const viewportHeight = layoutHeight;
  const stageContainer = useMemo(
    () => computeLiveStageContainer(viewportWidth, viewportHeight),
    [viewportWidth, viewportHeight],
  );

  const startIndex = useMemo(() => {
    if (!initialStreamId) return 0;
    const i = streams.findIndex((s) => s.id === initialStreamId);
    return i >= 0 ? i : 0;
  }, [initialStreamId, streams]);

  const [page, setPage] = useState(startIndex);
  const [walletOverlayActive, setWalletOverlayActive] = useState(false);
  const [paymentBlockerActive, setPaymentBlockerActive] = useState(false);

  useEffect(() => {
    setPage(startIndex);
  }, [startIndex]);

  useEffect(() => {
    if (!walletOverlayActive) return;
    setWalletOverlayActive(false);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <View
      style={styles.feedRoot}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setLayoutSize((prev) =>
            prev?.width === width && prev?.height === height ? prev : { width, height },
          );
        }
      }}
    >
      <PagerView
        key={initialStreamId ?? 'default'}
        style={styles.feedPager}
        initialPage={startIndex}
        orientation="vertical"
        scrollEnabled={!walletOverlayActive && !paymentBlockerActive}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        {streams.map((stream, index) => (
          <View key={stream.id} style={styles.page} collapsable={false}>
            <LiveSlide
              stream={stream}
              isActive={index === page}
              stageContainer={stageContainer}
              screenHeight={viewportHeight}
              onBack={onBack}
              signedIn={signedIn}
              onRequireAuth={onRequireAuth}
              accessToken={accessToken}
              userId={userId}
              onWalletOverlayChange={setWalletOverlayActive}
              onPaymentBlockerChange={setPaymentBlockerActive}
            />
          </View>
        ))}
      </PagerView>
    </View>
  );
}

const styles = StyleSheet.create({
  feedRoot: {
    flex: 1,
  },
  feedPager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  slide: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  connectionBanner: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    zIndex: 90,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  connectionBannerTxt: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  outbidToast: {
    position: 'absolute',
    top: 108,
    alignSelf: 'center',
    zIndex: 91,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.35)',
  },
  outbidToastTxt: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  recoveryToast: {
    position: 'absolute',
    top: 112,
    alignSelf: 'center',
    zIndex: 95,
    maxWidth: '88%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(18, 16, 10, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 80, 0.35)',
  },
  recoveryToastTxt: { color: colors.gold, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  stageRoot: {
    backgroundColor: '#000',
  },
  stageVideoFrame: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#000',
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
  hostAvatarTopCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
  hostNameTopCompact: {
    fontSize: 13,
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
  hostSubtitleTopCompact: {
    fontSize: 10,
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
  viewersTopRightCompact: {
    fontSize: 12,
  },
  endedBadge: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
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
  rightRailCompact: {
    gap: 10,
  },
  railBtn: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    minWidth: 48,
  },
  railBtnCompact: {
    minWidth: 44,
    gap: 2,
  },
  railLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  commerceOverlayHost: {
    position: 'absolute',
    zIndex: 12,
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
  blockedBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 30,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
    backgroundColor: 'rgba(76,5,25,0.82)',
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  blockedBannerText: {
    color: '#fecdd3',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  blockedBannerBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
  },
  blockedBannerBtnText: {
    color: '#fecdd3',
    fontSize: 12,
    fontWeight: '800',
  },
  mutedBanner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 20,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mutedBannerText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
